import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@ordena/database";
import { AppError } from "../middleware/error-handler";
import { decryptSecret } from "../utils/crypto-secrets";

const RESTAURANT_NAME = "Ordena";

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

export async function sendOrderConfirmationEmail(params: {
  to: string;
  name?: string | null;
  orderId: string;
  orderNumber: string;
  viewToken: string;
  branchName: string;
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

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Confirmación de tu pedido ${params.orderNumber} — ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nTu pago fue confirmado. Este es el resumen de tu pedido ${params.orderNumber} en ${params.branchName}:\n\n${itemLines.map((line) => `- ${line}`).join("\n")}\n\nTotal: ${totalFormatted}\n\nSigue el estado de tu pedido aquí:\n${trackingUrl}`,
    html: `<p>${greeting}</p><p>Tu pago fue confirmado. Este es el resumen de tu pedido <strong>${params.orderNumber}</strong> en ${params.branchName}:</p><ul>${itemLines.map((line) => `<li>${line}</li>`).join("")}</ul><p><strong>Total: ${totalFormatted}</strong></p><p><a href="${trackingUrl}" style="color:#ea5e1f;font-weight:bold;">Ver el estado de tu pedido</a></p>`,
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

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Tu pedido ${params.orderNumber} fue cancelado — ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nTu pedido ${params.orderNumber} fue cancelado.\n\n${params.cancellationReason ? `Motivo: ${params.cancellationReason}\n\n` : ""}El monto de ${totalFormatted} será reembolsado a tu método de pago original en los próximos días hábiles.`,
    html: `<p>${greeting}</p><p>Tu pedido <strong>${params.orderNumber}</strong> fue cancelado.</p>${params.cancellationReason ? `<p>Motivo: ${params.cancellationReason}</p>` : ""}<p>El monto de <strong>${totalFormatted}</strong> será reembolsado a tu método de pago original en los próximos días hábiles.</p>`,
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

  await transport.sendMail({
    from,
    to: params.to,
    subject: `Reembolso de tu pedido ${params.orderNumber} — ${RESTAURANT_NAME}`,
    text: `${greeting}\n\nSe procesó un reembolso de ${amountFormatted} sobre tu pedido ${params.orderNumber}.${scopeNote}\n\nMotivo: ${params.reason}\n\nEl monto será acreditado a tu método de pago original en los próximos días hábiles.`,
    html: `<p>${greeting}</p><p>Se procesó un reembolso de <strong>${amountFormatted}</strong> sobre tu pedido <strong>${params.orderNumber}</strong>.${scopeNote}</p><p>Motivo: ${params.reason}</p><p>El monto será acreditado a tu método de pago original en los próximos días hábiles.</p>`,
  });
}

export async function sendTestEmail(to: string) {
  const { transport, from } = await getSmtpTransport();
  await transport.sendMail({
    from,
    to,
    subject: `Correo de prueba — ${RESTAURANT_NAME}`,
    text: "Este es un correo de prueba de la configuración SMTP de Ordena. Si lo recibiste, la configuración funciona correctamente.",
    html: "<p>Este es un correo de prueba de la configuración SMTP de Ordena. Si lo recibiste, la configuración funciona correctamente.</p>",
  });
}
