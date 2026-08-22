import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@ordena/database";
import { AppError } from "../middleware/error-handler";
import { decryptSecret } from "../utils/crypto-secrets";
import { LOGO_WHITE_DATA_URI } from "./email-assets";

const RESTAURANT_NAME = "El Bajito";

async function loadSmtpSettings() {
  const settings = await prisma.smtpSettings.findUnique({
    where: { id: "singleton" },
  });
  if (!settings) {
    throw new AppError(503, "El envío de correos no está configurado");
  }
  return settings;
}

async function getSmtpTransport(): Promise<{
  transport: Transporter;
  from: string;
}> {
  const settings = await loadSmtpSettings();
  const password = settings.encryptedPassword
    ? decryptSecret(settings.encryptedPassword)
    : undefined;

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username
      ? { user: settings.username, pass: password }
      : undefined,
  });

  const from = settings.fromName
    ? `"${settings.fromName}" <${settings.fromEmail}>`
    : settings.fromEmail;

  return { transport, from };
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  name?: string | null,
) {
  const { transport, from } = await getSmtpTransport();
  const greeting = name ? `Hola ${name},` : "Hola,";

  await transport.sendMail({
    from,
    to,
    subject: `Restablece tu contraseña de ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nRecibimos una solicitud para restablecer tu contraseña. Abre este enlace (válido por 30 minutos) para crear una nueva:\n\n${resetUrl}\n\nSi no pediste esto, ignora este correo.`,
    html: `<p>${greeting}</p><p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace (válido por 30 minutos) para crear una nueva:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no pediste esto, ignora este correo.</p>`,
  });
}

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
};

export async function sendOAuthOnlyAccountEmail(
  to: string,
  providers: string[],
  name?: string | null,
) {
  const { transport, from } = await getSmtpTransport();
  const greeting = name ? `Hola ${name},` : "Hola,";
  const providerNames = providers.map((p) => PROVIDER_LABELS[p] ?? p);
  const providerList =
    providerNames.length > 0
      ? providerNames.join(" y ")
      : "Google o Facebook";

  await transport.sendMail({
    from,
    to,
    subject: `Tu cuenta de ${RESTAURANT_NAME} usa inicio de sesión con ${providerList}`,
    text: `${greeting}\n\nRecibimos una solicitud para restablecer la contraseña de esta cuenta, pero no tiene una contraseña configurada: se creó e inicia sesión con ${providerList}.\n\nPara entrar, usa el botón "Continuar con ${providerList}" en la pantalla de inicio de sesión.\n\nSi no pediste esto, ignora este correo.`,
    html: `<p>${greeting}</p><p>Recibimos una solicitud para restablecer la contraseña de esta cuenta, pero no tiene una contraseña configurada: se creó e inicia sesión con <strong>${providerList}</strong>.</p><p>Para entrar, usa el botón "Continuar con ${providerList}" en la pantalla de inicio de sesión.</p><p>Si no pediste esto, ignora este correo.</p>`,
  });
}

function formatMoney(cents: number, currency = "mxn") {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

const EMAIL_FONT = "font-family:Arial,Helvetica,sans-serif;";

/** Envoltorio de tabla estilo "recibo" — mismo esqueleto para los 3 correos de pedido. */
function emailLayout(innerHtml: string, badgeLabel: string) {
  const badge = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;border-radius:999px;padding:4px 12px;${EMAIL_FONT}font-size:11px;font-weight:bold;letter-spacing:0.04em;color:#ea5e1f;text-transform:uppercase;white-space:nowrap;">${badgeLabel}</td></tr></table>`;
  const header =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td align="left" valign="middle"><img src="${LOGO_WHITE_DATA_URI}" width="150" height="56" alt="${RESTAURANT_NAME}" style="display:block;border:0;outline:none;"></td>` +
    `<td align="right" valign="middle">${badge}</td>` +
    `</tr></table>`;

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f2;padding:24px 0;"><tr><td align="center">` +
    `<table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #eeeeee;" cellpadding="0" cellspacing="0">` +
    `<tr><td style="background-color:#ea5e1f;padding:18px 32px;border-radius:12px 12px 0 0;">${header}</td></tr>` +
    `<tr><td style="padding:32px;${EMAIL_FONT}font-size:14px;line-height:1.6;color:#1f2937;">${innerHtml}</td></tr>` +
    `<tr><td style="padding:16px 32px;background-color:#fafaf9;border-top:1px solid #eeeeee;border-radius:0 0 12px 12px;${EMAIL_FONT}font-size:12px;color:#9ca3af;">Este es un correo automático de ${RESTAURANT_NAME} — no respondas a este mensaje.</td></tr>` +
    `</table></td></tr></table>`
  );
}

/** Callout gris para el motivo de cancelación/reembolso. */
function emailReasonBlock(reason: string) {
  return `<p style="margin:0 0 16px;padding:12px 14px;background-color:#f9fafb;border-left:3px solid #d1d5db;border-radius:4px;color:#4b5563;">Motivo: ${reason}</p>`;
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  name?: string | null;
  orderId: string;
  orderNumber: string;
  viewToken: string;
  branchName: string;
  branchAddress: string;
  branchPhone?: string | null;
  pickupCode?: string | null;
  items: {
    productName: string;
    variantName?: string | null;
    quantity: number;
    lineTotal: number;
  }[];
  total: number;
  currency: string;
}) {
  const { transport, from } = await getSmtpTransport();
  const greeting = params.name ? `Hola ${params.name},` : "Hola,";
  const customerUrl = process.env.CUSTOMER_URL ?? "http://localhost:3000";
  const trackingUrl = `${customerUrl}/pedido/${params.orderId}?t=${encodeURIComponent(params.viewToken)}`;

  const itemLines = params.items.map(
    (item) =>
      `${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ""} — ${formatMoney(item.lineTotal, params.currency)}`,
  );
  const totalFormatted = formatMoney(params.total, params.currency);

  const itemRows = params.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap;">${formatMoney(item.lineTotal, params.currency)}</td></tr>`,
    )
    .join("");

  const pickupLinesText = [
    `Recoger en: ${params.branchName}`,
    params.branchAddress,
    params.branchPhone ? `Tel: ${params.branchPhone}` : null,
    params.pickupCode ? `Código de entrega: ${params.pickupCode}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const pickupBlockHtml =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f9fafb;border-radius:8px;"><tr><td style="padding:14px 16px;">` +
    `<p style="margin:0 0 4px;font-weight:bold;">Recoger en: ${params.branchName}</p>` +
    `<p style="margin:0;color:#4b5563;">${params.branchAddress}</p>` +
    `${params.branchPhone ? `<p style="margin:2px 0 0;color:#4b5563;">Tel: ${params.branchPhone}</p>` : ""}` +
    `${params.pickupCode ? `<p style="margin:12px 0 0;">Código de entrega: <strong style="font-size:16px;letter-spacing:0.05em;">${params.pickupCode}</strong></p>` : ""}` +
    `</td></tr></table>`;

  const html = emailLayout(
    `<p style="margin:0 0 16px;">${greeting}</p>` +
      `<p style="margin:0 0 20px;">Tu pago fue confirmado. Este es el resumen de tu pedido <strong>${params.orderNumber}</strong>:</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${itemRows}<tr><td style="padding:12px 0 0;font-weight:bold;border-top:2px solid #1f2937;">Total</td><td style="padding:12px 0 0;font-weight:bold;text-align:right;border-top:2px solid #1f2937;">${totalFormatted}</td></tr></table>` +
      pickupBlockHtml +
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background-color:#ea5e1f;"><a href="${trackingUrl}" style="display:inline-block;padding:12px 24px;${EMAIL_FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Ver el estado de tu pedido</a></td></tr></table>`,
    "Pedido confirmado",
  );

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Pedido confirmado — ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nTu pago fue confirmado. Este es el resumen de tu pedido ${params.orderNumber}:\n\n${itemLines.map((line) => `- ${line}`).join("\n")}\n\nTotal: ${totalFormatted}\n\n${pickupLinesText}\n\nSigue el estado de tu pedido aquí:\n${trackingUrl}`,
    html,
  });
}

export async function sendOrderCancelledEmail(params: {
  to: string;
  name?: string | null;
  orderNumber: string;
  cancellationReason?: string | null;
  total: number;
  currency: string;
}) {
  const { transport, from } = await getSmtpTransport();
  const greeting = params.name ? `Hola ${params.name},` : "Hola,";
  const totalFormatted = formatMoney(params.total, params.currency);

  const html = emailLayout(
    `<p style="margin:0 0 16px;">${greeting}</p>` +
      `<p style="margin:0 0 16px;">Tu pedido <strong>${params.orderNumber}</strong> fue cancelado.</p>` +
      `${params.cancellationReason ? emailReasonBlock(params.cancellationReason) : ""}` +
      `<p style="margin:0;">El monto de <strong>${totalFormatted}</strong> será reembolsado a tu método de pago original en los próximos días hábiles.</p>`,
    "Pedido cancelado",
  );

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Pedido cancelado — ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nTu pedido ${params.orderNumber} fue cancelado.\n\n${params.cancellationReason ? `Motivo: ${params.cancellationReason}\n\n` : ""}El monto de ${totalFormatted} será reembolsado a tu método de pago original en los próximos días hábiles.`,
    html,
  });
}

export async function sendOrderRefundEmail(params: {
  to: string;
  name?: string | null;
  orderNumber: string;
  reason: string;
  amount: number;
  isFullRefund: boolean;
  currency: string;
}) {
  const { transport, from } = await getSmtpTransport();
  const greeting = params.name ? `Hola ${params.name},` : "Hola,";
  const amountFormatted = formatMoney(params.amount, params.currency);
  const scopeNote = params.isFullRefund
    ? " Este reembolso cubre el total de tu pedido."
    : "";

  const html = emailLayout(
    `<p style="margin:0 0 16px;">${greeting}</p>` +
      `<p style="margin:0 0 16px;">Se procesó un reembolso de <strong>${amountFormatted}</strong> sobre tu pedido <strong>${params.orderNumber}</strong>.${scopeNote}</p>` +
      `${emailReasonBlock(params.reason)}` +
      `<p style="margin:0;">El monto será acreditado a tu método de pago original en los próximos días hábiles.</p>`,
    params.isFullRefund ? "Reembolso total" : "Reembolso parcial",
  );

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Reembolso de tu pedido — ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nSe procesó un reembolso de ${amountFormatted} sobre tu pedido ${params.orderNumber}.${scopeNote}\n\nMotivo: ${params.reason}\n\nEl monto será acreditado a tu método de pago original en los próximos días hábiles.`,
    html,
  });
}

/** Enlace al detalle del pedido en el backoffice, para los correos de alerta a admin. */
function adminOrderUrl(orderId: string) {
  const adminUrl = process.env.ADMIN_URL ?? "http://localhost:3001";
  return `${adminUrl}/pedidos/${orderId}`;
}

export async function sendCaptureFailedAlertEmail(params: {
  to: string;
  orderNumber: string;
  orderId: string;
  branchName: string;
  stripeStatus: string;
}) {
  const { transport, from } = await getSmtpTransport();
  const orderUrl = adminOrderUrl(params.orderId);
  const message = `El pedido <strong>${params.orderNumber}</strong> (${params.branchName}) no se pudo cobrar automáticamente al pasar a "Listo": Stripe reporta el pago como <strong>${params.stripeStatus}</strong>. Esto suele pasar cuando el hold de autorización expiró (Stripe libera los fondos ~7 días después de autorizar si no se capturan). El pedido quedó atorado y necesita revisión manual — probablemente cancelarlo desde el detalle del pedido.`;

  const html = emailLayout(
    `<p style="margin:0 0 16px;">Se detectó un pago que no se pudo cobrar.</p>` +
      `<p style="margin:0 0 20px;">${message}</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background-color:#ea5e1f;"><a href="${orderUrl}" style="display:inline-block;padding:12px 24px;${EMAIL_FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Revisar pedido</a></td></tr></table>`,
    "Pago no capturado",
  );

  await transport.sendMail({
    from,
    to: params.to,
    subject: `⚠ No se pudo cobrar el pedido ${params.orderNumber}`,
    text: `El pedido ${params.orderNumber} (${params.branchName}) no se pudo cobrar automáticamente al pasar a "Listo": Stripe reporta el pago como ${params.stripeStatus}. Probablemente el hold de autorización expiró. Revísalo aquí: ${orderUrl}`,
    html,
  });
}

const STALE_ORDER_STATUS_LABEL: Record<string, string> = {
  PAID: "Autorizado",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
};

export async function sendStaleActiveOrderAlertEmail(params: {
  to: string;
  orderNumber: string;
  orderId: string;
  branchName: string;
  status: string;
  hoursStuck: number;
}) {
  const { transport, from } = await getSmtpTransport();
  const orderUrl = adminOrderUrl(params.orderId);
  const statusLabel =
    STALE_ORDER_STATUS_LABEL[params.status] ?? params.status;
  const message = `El pedido <strong>${params.orderNumber}</strong> (${params.branchName}) lleva más de <strong>${params.hoursStuck}h</strong> en estado "${statusLabel}" sin avanzar. Puede ser un pedido abandonado operativamente — vale la pena revisarlo antes de que el hold de pago con Stripe expire.`;

  const html = emailLayout(
    `<p style="margin:0 0 16px;">Un pedido lleva demasiado tiempo sin avanzar.</p>` +
      `<p style="margin:0 0 20px;">${message}</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background-color:#ea5e1f;"><a href="${orderUrl}" style="display:inline-block;padding:12px 24px;${EMAIL_FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Revisar pedido</a></td></tr></table>`,
    "Pedido demorado",
  );

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Pedido ${params.orderNumber} lleva ${params.hoursStuck}h sin avanzar`,
    text: `El pedido ${params.orderNumber} (${params.branchName}) lleva más de ${params.hoursStuck}h en estado "${statusLabel}" sin avanzar. Revísalo aquí: ${orderUrl}`,
    html,
  });
}

export async function sendMissedWebhookAlertEmail(params: {
  to: string;
  orderNumber: string;
  orderId: string;
}) {
  const { transport, from } = await getSmtpTransport();
  const orderUrl = adminOrderUrl(params.orderId);
  const message = `El webhook de Stripe no llegó a tiempo para el pedido <strong>${params.orderNumber}</strong> — el cliente ya había pagado, pero el pedido no se había creado en Ordena hasta que el job de reconciliación lo detectó y lo recuperó. Vale la pena revisar que el endpoint del webhook (<code>/stripe/webhook</code>) esté respondiendo correctamente; si esto se repite, algún pedido podría no recuperarse a tiempo.`;

  const html = emailLayout(
    `<p style="margin:0 0 16px;">Se recuperó un pedido que el webhook de Stripe no había procesado.</p>` +
      `<p style="margin:0 0 20px;">${message}</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background-color:#ea5e1f;"><a href="${orderUrl}" style="display:inline-block;padding:12px 24px;${EMAIL_FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Ver pedido</a></td></tr></table>`,
    "Webhook perdido",
  );

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Pedido ${params.orderNumber} recuperado — revisa el webhook de Stripe`,
    text: `El webhook de Stripe no llegó a tiempo para el pedido ${params.orderNumber}. Se recuperó automáticamente, pero vale la pena revisar el endpoint /stripe/webhook. Ver pedido: ${orderUrl}`,
    html,
  });
}

export async function sendTestEmail(to: string) {
  const { transport, from } = await getSmtpTransport();
  await transport.sendMail({
    from,
    to,
    subject: `Correo de prueba — ${RESTAURANT_NAME}`,
    text: `Este es un correo de prueba de la configuración SMTP de ${RESTAURANT_NAME}. Si lo recibiste, la configuración funciona correctamente.`,
    html: `<p>Este es un correo de prueba de la configuración SMTP de ${RESTAURANT_NAME}. Si lo recibiste, la configuración funciona correctamente.</p>`,
  });
}
