import Stripe from "stripe";
import { prisma } from "@ordena/database";
import { AppError } from "../middleware/error-handler";

let stripe: Stripe | null = null;

export function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2026-07-29.dahlia",
    });
  }
  return stripe;
}

export function assertStripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key || key.includes("placeholder") || !key.startsWith("sk_")) {
    throw new AppError(
      503,
      "Stripe no está configurado. Agrega STRIPE_SECRET_KEY en el entorno.",
    );
  }
}

function stripeAccountRequestOptions(stripeAccount?: string | null):
  | { stripeAccount: string }
  | undefined {
  return stripeAccount ? { stripeAccount } : undefined;
}

export type ConnectAccountFlags = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
};

export function mapConnectAccountFlags(
  account: Stripe.Account,
): ConnectAccountFlags {
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);
  return {
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboardingComplete: chargesEnabled && detailsSubmitted,
  };
}

export async function createExpressAccount(opts: {
  branchId: string;
  businessName: string;
  email?: string | null;
}): Promise<Stripe.Account> {
  assertStripeConfigured();
  try {
    return await getStripe().accounts.create({
      type: "express",
      country: "MX",
      email: opts.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: opts.businessName,
      },
      metadata: {
        branchId: opts.branchId,
      },
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(502, `Error de Stripe (Connect): ${error.message}`);
    }
    throw error;
  }
}

export async function createAccountOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  assertStripeConfigured();
  try {
    const link = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return link.url;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(
        502,
        `Error de Stripe (Account Link): ${error.message}`,
      );
    }
    throw error;
  }
}

export async function createAccountLoginLink(accountId: string): Promise<string> {
  assertStripeConfigured();
  try {
    const link = await getStripe().accounts.createLoginLink(accountId);
    return link.url;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(
        502,
        `Error de Stripe (Express Dashboard): ${error.message}`,
      );
    }
    throw error;
  }
}

export async function retrieveConnectAccount(
  accountId: string,
): Promise<Stripe.Account> {
  assertStripeConfigured();
  try {
    return await getStripe().accounts.retrieve(accountId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(
        502,
        `Error de Stripe (cuenta conectada): ${error.message}`,
      );
    }
    throw error;
  }
}

/** Persiste flags de Connect en Branch a partir de un Account de Stripe. */
export async function applyConnectFlagsToBranch(
  branchId: string,
  flags: ConnectAccountFlags,
) {
  return prisma.branch.update({
    where: { id: branchId },
    data: {
      stripeChargesEnabled: flags.chargesEnabled,
      stripePayoutsEnabled: flags.payoutsEnabled,
      stripeDetailsSubmitted: flags.detailsSubmitted,
      stripeOnboardingComplete: flags.onboardingComplete,
    },
  });
}

export async function syncBranchStripeStatus(branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new AppError(404, "Sucursal no encontrada");
  if (!branch.stripeAccountId) {
    throw new AppError(400, "La sucursal no tiene cuenta Stripe Connect");
  }

  const account = await retrieveConnectAccount(branch.stripeAccountId);
  const flags = mapConnectAccountFlags(account);
  const updated = await applyConnectFlagsToBranch(branchId, flags);
  return { branch: updated, flags, account };
}

export type StripeCardSummary = {
  paymentBrand: string | null;
  paymentFunding: string | null;
  paymentLast4: string | null;
};

export type StripeBalanceSnapshot = {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
};

export type StripePayoutRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  arrivalDate: string | null;
  created: string;
  destinationLast4: string | null;
};

/** Extrae marca / funding / last4 del PaymentMethod de un PaymentIntent. */
export async function fetchStripeCardSummary(
  paymentIntentId: string | null | undefined,
): Promise<StripeCardSummary> {
  const empty: StripeCardSummary = {
    paymentBrand: null,
    paymentFunding: null,
    paymentLast4: null,
  };
  if (!paymentIntentId) return empty;

  try {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["payment_method"],
    });
    const pm = pi.payment_method;
    if (!pm || typeof pm === "string" || pm.type !== "card" || !pm.card) {
      return empty;
    }
    return {
      paymentBrand: pm.card.brand ?? null,
      paymentFunding: pm.card.funding ?? null,
      paymentLast4: pm.card.last4 ?? null,
    };
  } catch (error) {
    console.error("[stripe.card]", error);
    return empty;
  }
}

export async function fetchStripeBalance(
  stripeAccount?: string | null,
): Promise<StripeBalanceSnapshot> {
  try {
    const balance = await getStripe().balance.retrieve(
      undefined,
      stripeAccountRequestOptions(stripeAccount),
    );
    return {
      available: balance.available.map((b) => ({
        amount: b.amount,
        currency: b.currency,
      })),
      pending: balance.pending.map((b) => ({
        amount: b.amount,
        currency: b.currency,
      })),
    };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(502, `Error de Stripe (balance): ${error.message}`);
    }
    throw error;
  }
}

export async function listStripePayouts(opts: {
  from: Date;
  to: Date;
  limit?: number;
  stripeAccount?: string | null;
}): Promise<StripePayoutRow[]> {
  try {
    const list = await getStripe().payouts.list(
      {
        limit: opts.limit ?? 50,
        created: {
          gte: Math.floor(opts.from.getTime() / 1000),
          lte: Math.floor(opts.to.getTime() / 1000),
        },
        expand: ["data.destination"],
      },
      stripeAccountRequestOptions(opts.stripeAccount),
    );

    return list.data.map((p) => {
      let destinationLast4: string | null = null;
      const dest = p.destination;
      if (dest && typeof dest !== "string" && "last4" in dest) {
        const last4 = (dest as { last4?: string }).last4;
        if (typeof last4 === "string") destinationLast4 = last4;
      }

      return {
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method ?? null,
        arrivalDate: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString().slice(0, 10)
          : null,
        created: new Date(p.created * 1000).toISOString(),
        destinationLast4,
      };
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(502, `Error de Stripe (payouts): ${error.message}`);
    }
    throw error;
  }
}

/**
 * Autorización manual: al checkout solo se retienen fondos (`requires_capture`).
 * - COMPLETED → captura el monto real (`amountToCapture`); si es 0, libera el hold
 * - CANCELLED → libera la retención o reembolsa si ya estaba capturado
 */
export async function settleStripePayment(
  paymentIntentId: string | null | undefined,
  status: "COMPLETED" | "CANCELLED",
  amountToCapture?: number,
) {
  if (!paymentIntentId) return;

  const stripeClient = getStripe();
  let paymentIntent: Stripe.PaymentIntent;

  try {
    paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(502, `Error de Stripe: ${error.message}`);
    }
    throw error;
  }

  try {
    if (status === "COMPLETED") {
      const capturable = paymentIntent.amount_capturable;
      const target =
        typeof amountToCapture === "number" ? amountToCapture : capturable;

      if (paymentIntent.status === "succeeded") {
        return;
      }

      if (paymentIntent.status !== "requires_capture") {
        throw new AppError(
          502,
          `No se puede cobrar el pago (Stripe: ${paymentIntent.status})`,
        );
      }

      if (target <= 0) {
        await stripeClient.paymentIntents.cancel(paymentIntent.id);
        return;
      }

      const captureAmount = Math.min(target, capturable);
      if (captureAmount <= 0) {
        await stripeClient.paymentIntents.cancel(paymentIntent.id);
        return;
      }

      await stripeClient.paymentIntents.capture(paymentIntent.id, {
        amount_to_capture: captureAmount,
      });
      return;
    }

    if (paymentIntent.status === "requires_capture") {
      await stripeClient.paymentIntents.cancel(paymentIntent.id);
    } else if (paymentIntent.status === "succeeded") {
      // reverse_transfer: sin esto, Stripe reembolsa desde el balance de la
      // plataforma en vez de jalar el dinero de vuelta de la cuenta Connect de
      // la sucursal (destination charge) — y la plataforma no retiene nada de
      // ese cargo (sin application_fee), así que el reembolso fallaría o
      // saldría de fondos ajenos.
      await stripeClient.refunds.create({
        payment_intent: paymentIntent.id,
        reverse_transfer: true,
      });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Stripe.errors.StripeError) {
      throw new AppError(502, `Error de Stripe: ${error.message}`);
    }
    throw error;
  }
}
