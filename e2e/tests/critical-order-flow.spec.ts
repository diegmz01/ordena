import { test, expect } from "@playwright/test";
import { completeCheckoutSessionViaWebhook } from "../lib/stripe-webhook";

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const BRANCH_URL = process.env.E2E_BRANCH_URL ?? "http://localhost:3002";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "sucursal@ordena.local";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ??
  process.env.DEV_AUTH_PASSWORD ??
  "OrdenaDev2026!";

// Seed (packages/database/prisma/seed.ts): sucursal "Centro" con
// "Hamburguesa clásica" disponible, sin modificadores.
const BRANCH_NAME = "Centro";
const PRODUCT_NAME = "Hamburguesa clásica";

test.setTimeout(120_000);

test("flujo crítico: pedido de cliente hasta entrega en sucursal", async ({
  browser,
}) => {
  const staffPage = await (await browser.newContext()).newPage();
  const customerPage = await (await browser.newContext()).newPage();

  await test.step("Staff inicia sesión en apps/branch (el heartbeat abre la sucursal a pedidos)", async () => {
    await staffPage.goto(`${BRANCH_URL}/login`);
    await staffPage.locator("#email").fill(STAFF_EMAIL);
    await staffPage.locator("#password").fill(STAFF_PASSWORD);
    const heartbeat = staffPage.waitForResponse(
      (res) =>
        res.url().includes("/heartbeat") && res.request().method() === "POST",
    );
    await staffPage.getByRole("button", { name: "Entrar" }).click();
    await heartbeat;
  });

  const guestName = `E2E ${Date.now()}`;
  let orderId = "";
  let viewToken = "";

  await test.step("Cliente arma el carrito y paga como invitado (checkout real)", async () => {
    await customerPage.goto(`${WEB_URL}/sucursales`);
    const branchRow = customerPage
      .getByRole("listitem")
      .filter({ hasText: BRANCH_NAME });
    await branchRow.getByRole("button", { name: /Ver menú|Elegir/ }).click();

    await customerPage.waitForURL(/\/menu/);
    await customerPage
      .getByRole("button", { name: new RegExp(PRODUCT_NAME) })
      .click();
    await customerPage
      .getByRole("button", { name: /Agregar al pedido/ })
      .click();

    await customerPage.goto(`${WEB_URL}/checkout`);
    await customerPage
      .getByRole("button", { name: "Continuar como invitado" })
      .click();
    await customerPage.getByPlaceholder("Nombre").fill(guestName);
    await customerPage
      .getByPlaceholder("Email")
      .fill(`e2e-${Date.now()}@example.com`);
    await customerPage.getByPlaceholder("Teléfono").fill("5555555555");

    const checkoutResponse = customerPage.waitForResponse(
      (res) =>
        res.url().includes("/api-backend/checkout") &&
        res.request().method() === "POST",
    );
    await customerPage
      .getByRole("button", { name: /Continuar al pago/ })
      .click();
    const response = await checkoutResponse;
    const body = (await response.json()) as {
      orderId: string;
      viewToken: string;
      sessionId: string;
    };
    expect(body.sessionId, "checkout debe crear una Stripe Session real").toBeTruthy();
    orderId = body.orderId;
    viewToken = body.viewToken;

    // Evita pagar de verdad en el formulario embebido de Stripe: en vez de
    // eso se simula la confirmación vía webhook (ver e2e/lib/stripe-webhook.ts).
    await completeCheckoutSessionViaWebhook(API_URL, body.sessionId);
  });

  await test.step("Staff acepta el pedido (ticket TPV + tiempo de preparación)", async () => {
    const orderCard = staffPage.getByText(guestName).first();
    await expect(orderCard).toBeVisible({ timeout: 20_000 });
    await orderCard.click();

    await staffPage.getByRole("button", { name: "Aceptar pedido" }).click();
    await staffPage.locator("#accept-ptv-ticket").fill("42");
    await staffPage.getByRole("button", { name: "Guardar" }).click();
    await staffPage
      .getByRole("button", { name: "Confirmar e iniciar" })
      .click();

    // PAID -> ACCEPTED. Con el ticket ya asignado, el siguiente botón pasa a
    // "Iniciar preparación" (ver beginAccept en apps/branch/src/app/page.tsx).
    await expect(
      staffPage.getByRole("button", { name: "Iniciar preparación" }),
    ).toBeVisible();
  });

  await test.step("Staff inicia la preparación", async () => {
    await staffPage
      .getByRole("button", { name: "Iniciar preparación" })
      .click();
    await staffPage
      .getByRole("button", { name: "Confirmar e iniciar" })
      .click();

    // ACCEPTED -> PREPARING.
    await expect(
      staffPage.getByRole("button", { name: "Listo para recoger · cobrar" }),
    ).toBeVisible();
  });

  let pickupCode = "";

  await test.step("Staff marca el pedido listo; el cliente ve su código de entrega", async () => {
    await staffPage
      .getByRole("button", { name: "Listo para recoger · cobrar" })
      .click();
    await expect(
      staffPage.getByRole("button", { name: "Entregar" }),
    ).toBeVisible();

    await customerPage.goto(`${WEB_URL}/pedido/${orderId}?t=${viewToken}`);
    const codeCard = customerPage.locator(".customer-card", {
      hasText: "Código de entrega",
    });
    await expect(codeCard).toBeVisible({ timeout: 20_000 });
    pickupCode = (await codeCard.locator("p.text-4xl").textContent())?.trim() ?? "";
    expect(pickupCode).toMatch(/^\d+$/);
  });

  await test.step("Staff entrega el pedido con el código del cliente", async () => {
    await staffPage.getByRole("button", { name: "Entregar" }).click();
    await staffPage.locator("#pickup-code").fill(pickupCode);
    await staffPage
      .getByRole("button", { name: "Confirmar entrega" })
      .click();

    // COMPLETED: el pedido ya no ofrece "Entregar" ni el modal de código.
    await expect(
      staffPage.getByRole("button", { name: "Confirmar entrega" }),
    ).toBeHidden();
    await expect(
      staffPage.getByRole("button", { name: "Entregar" }),
    ).toBeHidden();
  });
});
