import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "@ordena/database";
import { checkoutValidateSchema, guestCheckoutSchema } from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  optionalAuth,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { effectiveAvailability } from "../utils/branch-availability";
import { generateOrderNumber, generateViewToken } from "../utils/jwt";
import { getStripe } from "../utils/stripe";
import { checkoutRateLimiter } from "../middleware/rate-limit";
import {
  orderableBranchProductWhere,
  unavailableModifierIdsForBranch,
} from "../utils/branch-menu-stock";
import { findUnavailableCartLines } from "../utils/validate-cart-stock";

export const checkoutRouter = Router();

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

checkoutRouter.post("/", checkoutRateLimiter, optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  let createdOrderId: string | null = null;
  try {
    assertStripeConfigured();

    const parsed = guestCheckoutSchema.parse(req.body);
    const user = req.authUser;

    if (!user) {
      if (!parsed.guestName || !parsed.guestEmail || !parsed.guestPhone) {
        throw new AppError(
          400,
          "Invitado requiere nombre, email y teléfono",
        );
      }
    }

    const branch = await assertBranchAcceptingOrders(parsed.branchId);

    if (!branch.stripeAccountId || !branch.stripeChargesEnabled) {
      throw new AppError(
        400,
        "Esta sucursal aún no puede cobrar con tarjeta. Completa el onboarding de Stripe Connect en Admin → Sucursales.",
      );
    }

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
      const unitPrice = product.basePrice + modsDelta;
      const labels = selectedMods.map((m) => m.name);

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        variantName: labels.length > 0 ? labels.join(", ") : undefined,
        plateLabel: item.plateLabel?.trim() || null,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      });
    }

    const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0);

    const viewToken = generateViewToken();
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        viewToken,
        branchId: branch.id,
        userId: user?.id ?? null,
        guestName: user ? null : parsed.guestName,
        guestEmail: user ? null : parsed.guestEmail,
        guestPhone: user ? null : parsed.guestPhone,
        subtotal,
        discount: 0,
        total: subtotal,
        notes: parsed.notes,
        items: {
          create: resolvedItems.map(
            ({
              productId,
              productName,
              variantName,
              plateLabel,
              unitPrice,
              quantity,
              lineTotal,
            }) => ({
              productId,
              productName,
              variantName,
              plateLabel,
              unitPrice,
              quantity,
              lineTotal,
            }),
          ),
        },
      },
    });
    createdOrderId = order.id;

    const appUrl = process.env.CUSTOMER_URL ?? "http://localhost:3000";
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Autoriza (congela) fondos; el cobro real ocurre al entregar (COMPLETED).
      // Destination charge → al capturar, Stripe transfiere a la cuenta de la sucursal.
      payment_intent_data: {
        capture_method: "manual",
        on_behalf_of: branch.stripeAccountId,
        transfer_data: {
          destination: branch.stripeAccountId,
        },
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: branch.id,
        },
      },
      customer_email: user?.email ?? parsed.guestEmail ?? undefined,
      line_items: resolvedItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "mxn",
          unit_amount: item.unitPrice,
          product_data: {
            name: item.variantName
              ? `${item.productName} (${item.variantName})`
              : item.productName,
          },
        },
      })),
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId: branch.id,
        stripeAccountId: branch.stripeAccountId,
      },
      success_url: `${appUrl}/pedido/${order.id}?success=1&t=${encodeURIComponent(viewToken)}`,
      cancel_url: `${appUrl}/checkout?canceled=1&branch=${branch.id}`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });

    res.json({
      orderId: order.id,
      viewToken,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (createdOrderId) {
      await prisma.order
        .update({
          where: { id: createdOrderId },
          data: { status: "CANCELLED" },
        })
        .catch(() => undefined);
    }

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
