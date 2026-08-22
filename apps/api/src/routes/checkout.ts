import { randomUUID } from "crypto";
import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "@ordena/database";
import {
  checkoutValidateSchema,
  comboProductName,
  computeServiceFee,
  guestCheckoutSchema,
} from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  optionalAuth,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { effectiveAvailability } from "../utils/branch-availability";
import { generateOrderNumber, generateViewToken } from "../utils/jwt";
import { getStripe } from "../utils/stripe";
import { checkoutRateLimiter } from "../middleware/rate-limit";
import { requireTurnstile } from "../middleware/turnstile";
import {
  orderableBranchProductWhere,
  unavailableModifierIdsForBranch,
} from "../utils/branch-menu-stock";
import { findUnavailableCartLines } from "../utils/validate-cart-stock";

export const checkoutRouter = Router();

type CheckoutResponse = {
  orderId: string;
  viewToken: string;
  clientSecret: string;
  sessionId: string;
};

function assertStripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key || key.includes("placeholder") || !key.startsWith("sk_")) {
    throw new AppError(
      503,
      "Stripe no está configurado. Agrega una STRIPE_SECRET_KEY real (sk_test_…) en el archivo .env",
    );
  }
}

async function assertBranchAcceptingOrders(branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, isActive: true },
  });
  if (!branch) {
    throw new AppError(400, "Sucursal no disponible");
  }

  const availability = effectiveAvailability(branch);
  if (!availability.acceptingOrders) {
    const reason =
      availability.source === "offline"
        ? "La sucursal no está conectada y no acepta pedidos nuevos"
        : availability.status === "PAUSED"
          ? "La sucursal está pausada temporalmente y no acepta pedidos nuevos"
          : availability.source === "schedule"
            ? "La sucursal está fuera de su horario de atención"
            : "La sucursal está cerrada y no acepta pedidos nuevos";
    throw new AppError(400, reason);
  }

  return branch;
}

/** Respuesta de checkout para un intento de pago ya en curso (retry idempotente). */
async function pendingCheckoutResponse(pending: {
  id: string;
  viewToken: string;
  stripeSessionId: string;
}): Promise<CheckoutResponse> {
  const session = await getStripe().checkout.sessions.retrieve(
    pending.stripeSessionId,
  );
  // Sesión ya completada o expirada: Stripe deja de exponer el client_secret
  // y el formulario embebido no puede montarse con él.
  if (!session.client_secret) {
    throw new AppError(
      409,
      "Este intento de pago ya no está activo. Recarga la página e intenta de nuevo.",
    );
  }
  return {
    orderId: pending.id,
    viewToken: pending.viewToken,
    clientSecret: session.client_secret,
    sessionId: session.id,
  };
}

/**
 * Doble submit / retry de red con la misma idempotencyKey → reusar el
 * intento de pago (o el pedido, si ya se pagó) en vez de duplicarlo.
 */
async function findExistingCheckoutByIdempotencyKey(
  idempotencyKey: string,
): Promise<CheckoutResponse | null> {
  const pending = await prisma.pendingCheckout.findUnique({
    where: { idempotencyKey },
  });
  if (pending) {
    return pendingCheckoutResponse(pending);
  }

  // El webhook ya convirtió este intento en un pedido real antes de que
  // llegara el retry: no hay client_secret que devolver (Stripe ya cobró),
  // avisamos en vez de intentar reabrir o duplicar el pago.
  const order = await prisma.order.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (order) {
    throw new AppError(
      409,
      'Ya completaste el pago de este pedido. Revisa "Mis pedidos".',
    );
  }

  return null;
}

/** Público: valida stock del carrito en vivo (sin crear pedido ni Stripe). */
checkoutRouter.post("/validate", checkoutRateLimiter, async (req, res, next) => {
  try {
    const parsed = checkoutValidateSchema.parse(req.body);
    await assertBranchAcceptingOrders(parsed.branchId);
    const unavailable = await findUnavailableCartLines(
      parsed.branchId,
      parsed.items,
    );
    res.json({
      data: {
        ok: unavailable.length === 0,
        unavailable,
      },
    });
  } catch (error) {
    next(error);
  }
});

checkoutRouter.post(
  "/",
  checkoutRateLimiter,
  optionalAuth,
  // Solo invitados (sin sesión) necesitan pasar Turnstile: un cliente ya
  // autenticado pasó login (que ya exige Turnstile) para llegar hasta acá.
  requireTurnstile({ skip: (req) => !!(req as AuthenticatedRequest).authUser }),
  async (req: AuthenticatedRequest, res, next) => {
  try {
    assertStripeConfigured();

    const parsed = guestCheckoutSchema.parse(req.body);
    const user = req.authUser;

    if (parsed.idempotencyKey) {
      const existing = await findExistingCheckoutByIdempotencyKey(
        parsed.idempotencyKey,
      );
      if (existing) {
        res.json(existing);
        return;
      }
    }

    if (!user) {
      if (!parsed.guestName || !parsed.guestEmail || !parsed.guestPhone) {
        throw new AppError(
          400,
          "Invitado requiere nombre, email y teléfono",
        );
      }
    } else if (!user.phone?.trim()) {
      throw new AppError(
        400,
        "Debes registrar tu número de teléfono antes de generar el pedido",
      );
    }

    const branch = await assertBranchAcceptingOrders(parsed.branchId);

    const unavailable = await findUnavailableCartLines(branch.id, parsed.items);
    if (unavailable.length > 0) {
      const names = [...new Set(unavailable.map((u) => u.productName))];
      throw new AppError(
        409,
        `Algunos productos ya no están disponibles: ${names.join(", ")}. Revisa tu pedido e intenta de nuevo.`,
      );
    }

    const unavailableMods = await unavailableModifierIdsForBranch(branch.id);

    const resolvedItems = [];
    for (const item of parsed.items) {
      const product = await prisma.product.findFirst({
        where: {
          id: item.productId,
          isActive: true,
          branches: {
            some: orderableBranchProductWhere(branch.id),
          },
        },
        include: {
          modifiers: {
            include: { modifier: true },
          },
        },
      });

      if (!product) {
        throw new AppError(
          400,
          `Producto no disponible en esta sucursal: ${item.productName ?? item.productId}`,
        );
      }

      const allActive = product.modifiers
        .map((pm) => pm.modifier)
        .filter((m) => m.isActive);

      const assigned = allActive.filter((m) => !unavailableMods.has(m.id));

      const requiredIds = assigned.filter((m) => m.isRequired).map((m) => m.id);
      const requestedIds = [...new Set(item.modifierIds ?? [])];

      for (const id of requestedIds) {
        if (!assigned.some((m) => m.id === id)) {
          throw new AppError(
            400,
            `Modificador no válido para ${product.name}`,
          );
        }
      }

      const finalIds = [...new Set([...requiredIds, ...requestedIds])];
      const selectedMods = assigned.filter((m) => finalIds.includes(m.id));
      const modsDelta = selectedMods.reduce((sum, m) => sum + m.priceDelta, 0);
      const labels = selectedMods.map((m) => m.name);

      let secondaryProductId: string | undefined;
      let secondaryProductName: string | undefined;
      let basePrice = product.basePrice;

      if (item.secondaryProductId) {
        if (!product.allowCombo) {
          throw new AppError(
            400,
            `${product.name} no admite combinarse con otro producto`,
          );
        }
        if (item.secondaryProductId === product.id) {
          throw new AppError(400, "No puedes combinar un producto consigo mismo");
        }

        const secondary = await prisma.product.findFirst({
          where: {
            id: item.secondaryProductId,
            isActive: true,
            allowCombo: true,
            categoryId: product.categoryId,
            branches: {
              some: orderableBranchProductWhere(branch.id),
            },
          },
        });

        if (!secondary) {
          throw new AppError(
            400,
            `Producto para combinar no disponible en esta sucursal`,
          );
        }

        secondaryProductId = secondary.id;
        secondaryProductName = secondary.name;
        basePrice = Math.max(product.basePrice, secondary.basePrice);
      }

      const unitPrice = basePrice + modsDelta;

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        variantName: labels.length > 0 ? labels.join(", ") : undefined,
        secondaryProductId,
        secondaryProductName,
        plateLabel: item.plateLabel?.trim() || null,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      });
    }

    const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0);

    const feeSettings = await prisma.serviceFeeSettings.findUnique({
      where: { id: "singleton" },
    });
    const serviceFee = computeServiceFee(feeSettings, subtotal);

    // Pre-generados: el Order real (creado recién cuando el webhook confirme
    // el pago) va a reusar este mismo id/viewToken, así que el return_url de
    // Stripe (construido acá abajo, antes de que el pedido exista) ya apunta
    // al lugar correcto.
    const pendingId = randomUUID();
    const viewToken = generateViewToken();
    const orderNumber = generateOrderNumber();

    const appUrl = process.env.CUSTOMER_URL ?? "http://localhost:3000";
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Embebido dentro de /checkout en vez de redirigir a la página hospedada
      // de Stripe. Apple Pay / Google Pay se muestran solos, pero a diferencia
      // del checkout hospedado exigen registrar el dominio de apps/web en
      // Stripe (Dominios de métodos de pago) — ver docs/DEPLOY.md.
      // Stripe renombró este valor: "embedded" fue reemplazado por
      // "embedded_page" (el modo anterior dejó de estar soportado).
      ui_mode: "embedded_page",
      // Mínimo permitido por Stripe; pasado esto el webhook borra el intento
      // de pago pendiente (nunca llegó a existir un pedido que cancelar).
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      // Autoriza (congela) fondos; el cobro real ocurre al entregar (COMPLETED).
      payment_intent_data: {
        capture_method: "manual",
        metadata: {
          orderId: pendingId,
          orderNumber,
          branchId: branch.id,
        },
      },
      customer_email: user?.email ?? parsed.guestEmail ?? undefined,
      line_items: [
        ...resolvedItems.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "mxn",
            unit_amount: item.unitPrice,
            product_data: {
              name: item.variantName
                ? `${comboProductName(item.productName, item.secondaryProductName)} (${item.variantName})`
                : comboProductName(item.productName, item.secondaryProductName),
            },
          },
        })),
        ...(serviceFee > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "mxn",
                  unit_amount: serviceFee,
                  product_data: { name: "Tarifa de servicios" },
                },
              },
            ]
          : []),
      ],
      metadata: {
        orderId: pendingId,
        orderNumber,
        branchId: branch.id,
      },
      // En ui_mode embedded_page no hay cancel_url: si el cliente abandona,
      // el webhook borra este PendingCheckout cuando Stripe expira la sesión.
      return_url: `${appUrl}/pedido/${pendingId}?success=1&t=${encodeURIComponent(viewToken)}`,
    }, parsed.idempotencyKey ? { idempotencyKey: parsed.idempotencyKey } : undefined);

    let pending;
    try {
      pending = await prisma.pendingCheckout.create({
        data: {
          id: pendingId,
          viewToken,
          orderNumber,
          idempotencyKey: parsed.idempotencyKey ?? null,
          branchId: branch.id,
          userId: user?.id ?? null,
          guestName: user ? null : parsed.guestName,
          guestEmail: user ? null : parsed.guestEmail,
          guestPhone: user ? null : parsed.guestPhone,
          subtotal,
          serviceFee,
          total: subtotal + serviceFee,
          notes: parsed.notes,
          itemsJson: resolvedItems,
          stripeSessionId: session.id,
        },
      });
    } catch (error) {
      // Carrera: dos requests con la misma idempotencyKey llegaron casi a la
      // vez y ambas crearon una Stripe Session; el constraint único de acá
      // detecta la segunda. Dejamos que esta sesión sobrante expire sola y
      // devolvemos la que ganó la carrera.
      const isUniqueClash =
        parsed.idempotencyKey &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (isUniqueClash && parsed.idempotencyKey) {
        const existing = await findExistingCheckoutByIdempotencyKey(
          parsed.idempotencyKey,
        );
        if (existing) {
          res.json(existing);
          return;
        }
      }
      throw error;
    }

    res.json({
      orderId: pending.id,
      viewToken,
      clientSecret: session.client_secret,
      sessionId: session.id,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return next(
        new AppError(
          502,
          error.type === "StripeAuthenticationError"
            ? "Clave de Stripe inválida. Revisa STRIPE_SECRET_KEY en el .env"
            : `Error de Stripe: ${error.message}`,
        ),
      );
    }

    next(error);
  }
});
