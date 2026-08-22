import { prisma } from "@ordena/database";

/**
 * Envía una alerta operativa a todos los usuarios ADMIN, uno por uno,
 * sin dejar que el fallo de un destinatario (o del SMTP en general)
 * tumbe el job que la dispara.
 */
export async function notifyAdmins(sendOne: (to: string) => Promise<void>) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });

  for (const admin of admins) {
    try {
      await sendOne(admin.email);
    } catch (error) {
      console.error("[admin-alerts]", admin.email, error);
    }
  }
}
