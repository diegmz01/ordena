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
