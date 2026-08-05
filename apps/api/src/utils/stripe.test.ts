import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../middleware/error-handler";
import { settleStripePayment } from "./stripe";

const paymentIntentsRetrieve = vi.fn();
const paymentIntentsCapture = vi.fn();
const paymentIntentsCancel = vi.fn();
const refundsCreate = vi.fn();

// vi.mock se hoistea automáticamente sobre los imports de arriba, así que
// "stripe" ya está mockeado para cuando ./stripe (importado arriba) lo resuelva.
vi.mock("stripe", () => {
  class StripeError extends Error {}

  const StripeMock = vi.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: paymentIntentsRetrieve,
      capture: paymentIntentsCapture,
      cancel: paymentIntentsCancel,
    },
    refunds: {
      create: refundsCreate,
    },
  }));
  // Statics accedidos como Stripe.errors.StripeError en utils/stripe.ts
  (StripeMock as unknown as { errors: unknown }).errors = { StripeError };

  return { default: StripeMock };
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
});

describe("settleStripePayment", () => {
  it("no hace nada si no hay paymentIntentId (ej. total 0 desde el inicio)", async () => {
    await settleStripePayment(null, "COMPLETED", 1000);
    expect(paymentIntentsRetrieve).not.toHaveBeenCalled();
  });

  it("COMPLETED con requires_capture: captura exactamente el monto pedido", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_capture",
      amount_capturable: 10000,
    });

    await settleStripePayment("pi_1", "COMPLETED", 8000);

    expect(paymentIntentsCapture).toHaveBeenCalledWith("pi_1", {
      amount_to_capture: 8000,
    });
    expect(paymentIntentsCancel).not.toHaveBeenCalled();
  });

  it("COMPLETED con monto a capturar 0 (todo agotado): libera el hold en vez de capturar", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_capture",
      amount_capturable: 10000,
    });

    await settleStripePayment("pi_1", "COMPLETED", 0);

    expect(paymentIntentsCancel).toHaveBeenCalledWith("pi_1");
    expect(paymentIntentsCapture).not.toHaveBeenCalled();
  });

  it("COMPLETED nunca captura más de lo autorizado (amount_capturable manda)", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_capture",
      amount_capturable: 5000,
    });

    await settleStripePayment("pi_1", "COMPLETED", 8000);

    expect(paymentIntentsCapture).toHaveBeenCalledWith("pi_1", {
      amount_to_capture: 5000,
    });
  });

  it("COMPLETED es idempotente: si ya estaba succeeded, no vuelve a capturar", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      amount_capturable: 0,
    });

    await settleStripePayment("pi_1", "COMPLETED", 8000);

    expect(paymentIntentsCapture).not.toHaveBeenCalled();
    expect(paymentIntentsCancel).not.toHaveBeenCalled();
  });

  it("COMPLETED en un estado inesperado de Stripe lanza AppError 502 en vez de fallar en silencio", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "canceled",
      amount_capturable: 0,
    });

    await expect(
      settleStripePayment("pi_1", "COMPLETED", 8000),
    ).rejects.toBeInstanceOf(AppError);
    expect(paymentIntentsCapture).not.toHaveBeenCalled();
  });

  it("CANCELLED con requires_capture: libera el hold (no cobra nada)", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_capture",
      amount_capturable: 10000,
    });

    await settleStripePayment("pi_1", "CANCELLED");

    expect(paymentIntentsCancel).toHaveBeenCalledWith("pi_1");
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("CANCELLED sobre un pago ya capturado: reembolsa en vez de cancelar", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      amount_capturable: 0,
    });

    await settleStripePayment("pi_1", "CANCELLED");

    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
    expect(paymentIntentsCancel).not.toHaveBeenCalled();
  });
});
