import { Router } from "express";
import { prisma } from "@ordena/database";
import { serviceFeeSettingsSchema, smtpSettingsSchema } from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  requireAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { encryptSecret } from "../utils/crypto-secrets";
import { sendTestEmail } from "../lib/mailer";
import { recordAdminAction } from "../utils/audit-log";

export const settingsRouter = Router();

settingsRouter.get(
  "/smtp",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const settings = await prisma.smtpSettings.findUnique({
        where: { id: "singleton" },
      });
      if (!settings) {
        return res.json({ data: null });
      }
      res.json({
        data: {
          host: settings.host,
          port: settings.port,
          secure: settings.secure,
          username: settings.username,
          hasPassword: Boolean(settings.encryptedPassword),
          fromEmail: settings.fromEmail,
          fromName: settings.fromName,
          updatedAt: settings.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

settingsRouter.put(
  "/smtp",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = smtpSettingsSchema.parse(req.body);

      const existing = await prisma.smtpSettings.findUnique({
        where: { id: "singleton" },
      });

      const encryptedPassword = data.password
        ? encryptSecret(data.password)
        : (existing?.encryptedPassword ?? null);

      const settings = await prisma.smtpSettings.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          host: data.host,
          port: data.port,
          secure: data.secure,
          username: data.username,
          encryptedPassword,
          fromEmail: data.fromEmail,
          fromName: data.fromName,
        },
        update: {
          host: data.host,
          port: data.port,
          secure: data.secure,
          username: data.username,
          encryptedPassword,
          fromEmail: data.fromEmail,
          fromName: data.fromName,
        },
      });

      await recordAdminAction({
        actorId: authReq.authUser!.id,
        action: "settings.smtp_update",
        entityType: "SmtpSettings",
        entityId: settings.id,
        metadata: {
          host: data.host,
          port: data.port,
          fromEmail: data.fromEmail,
        },
      });

      res.json({
        data: {
          host: settings.host,
          port: settings.port,
          secure: settings.secure,
          username: settings.username,
          hasPassword: Boolean(settings.encryptedPassword),
          fromEmail: settings.fromEmail,
          fromName: settings.fromName,
          updatedAt: settings.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Público: tarifa de servicios vigente, para mostrarla antes de pagar. */
settingsRouter.get("/service-fee", async (_req, res, next) => {
  try {
    const settings = await prisma.serviceFeeSettings.findUnique({
      where: { id: "singleton" },
    });
    res.json({
      data: {
        type: settings?.type ?? "FIXED",
        amount: settings?.amount ?? 0,
        percentage: settings?.percentage ?? 0,
        isActive: settings?.isActive ?? false,
      },
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put(
  "/service-fee",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = serviceFeeSettingsSchema.parse(req.body);

      const settings = await prisma.serviceFeeSettings.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          type: data.type,
          amount: data.amount,
          percentage: data.percentage,
          isActive: data.isActive,
        },
        update: {
          type: data.type,
          amount: data.amount,
          percentage: data.percentage,
          isActive: data.isActive,
        },
      });

      await recordAdminAction({
        actorId: authReq.authUser!.id,
        action: "settings.service_fee_update",
        entityType: "ServiceFeeSettings",
        entityId: settings.id,
        metadata: {
          type: settings.type,
          amount: settings.amount,
          percentage: settings.percentage,
          isActive: settings.isActive,
        },
      });

      res.json({ data: settings });
    } catch (error) {
      next(error);
    }
  },
);

settingsRouter.post(
  "/smtp/test",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const to =
        typeof req.body?.to === "string" && req.body.to.trim()
          ? req.body.to.trim()
          : authReq.authUser!.email;

      await sendTestEmail(to);
      res.json({ data: { message: `Correo de prueba enviado a ${to}` } });
    } catch (error) {
      if (error instanceof AppError) return next(error);
      next(
        new AppError(
          502,
          error instanceof Error
            ? `No se pudo enviar el correo de prueba: ${error.message}`
            : "No se pudo enviar el correo de prueba",
        ),
      );
    }
  },
);
