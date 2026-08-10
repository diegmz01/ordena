import { Router } from "express";
import { prisma } from "@ordena/database";
import {
  faqCreateSchema,
  faqReorderSchema,
  faqUpdateSchema,
  siteContentSlugSchema,
  siteContentUpdateSchema,
} from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  requireAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { recordAdminAction } from "../utils/audit-log";

export const contentRouter = Router();

/** Público: FAQs activas para el sitio de cliente. */
contentRouter.get("/faqs", async (_req, res, next) => {
  try {
    const faqs = await prisma.faq.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, question: true, answer: true },
    });
    res.json({ data: faqs });
  } catch (error) {
    next(error);
  }
});

/** Público: contenido de una página estática (privacidad, términos). */
contentRouter.get("/pages/:slug", async (req, res, next) => {
  try {
    const slug = siteContentSlugSchema.parse(req.params.slug);
    const page = await prisma.siteContent.findUnique({ where: { id: slug } });
    if (!page) throw new AppError(404, "Página no encontrada");
    res.json({ data: page });
  } catch (error) {
    next(error);
  }
});

/** Admin: todas las FAQs (incl. inactivas). */
contentRouter.get(
  "/admin/faqs",
  authenticate,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const faqs = await prisma.faq.findMany({
        orderBy: [{ sortOrder: "asc" }],
      });
      res.json({ data: faqs });
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.post(
  "/admin/faqs",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = faqCreateSchema.parse(req.body);
      const maxOrder = await prisma.faq.aggregate({
        _max: { sortOrder: true },
      });
      const faq = await prisma.faq.create({
        data: {
          question: body.question.trim(),
          answer: body.answer.trim(),
          isActive: body.isActive ?? true,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
      });
      res.status(201).json({ data: faq });
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.patch(
  "/admin/faqs/reorder",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = faqReorderSchema.parse(req.body);

      const allFaqs = await prisma.faq.findMany({ select: { id: true } });
      const allFaqIds = new Set(allFaqs.map((f) => f.id));

      if (
        body.faqIds.length !== allFaqIds.size ||
        !body.faqIds.every((id) => allFaqIds.has(id))
      ) {
        throw new AppError(
          400,
          "La lista de preguntas no coincide con las preguntas existentes",
        );
      }

      await prisma.$transaction(
        body.faqIds.map((id, index) =>
          prisma.faq.update({ where: { id }, data: { sortOrder: index } }),
        ),
      );

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.patch(
  "/admin/faqs/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const body = faqUpdateSchema.parse(req.body);
      const existing = await prisma.faq.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Pregunta no encontrada");

      const faq = await prisma.faq.update({
        where: { id: existing.id },
        data: {
          question: body.question?.trim(),
          answer: body.answer?.trim(),
          isActive: body.isActive,
        },
      });

      res.json({ data: faq });
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.delete(
  "/admin/faqs/:id",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const existing = await prisma.faq.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Pregunta no encontrada");

      await prisma.faq.delete({ where: { id: existing.id } });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

/** Admin: contenido crudo de una página estática para editar. */
contentRouter.get(
  "/admin/pages/:slug",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const slug = siteContentSlugSchema.parse(req.params.slug);
      const page = await prisma.siteContent.findUnique({
        where: { id: slug },
      });
      res.json({ data: page });
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.put(
  "/admin/pages/:slug",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const slug = siteContentSlugSchema.parse(req.params.slug);
      const body = siteContentUpdateSchema.parse(req.body);

      const page = await prisma.siteContent.upsert({
        where: { id: slug },
        create: { id: slug, title: body.title.trim(), content: body.content },
        update: { title: body.title.trim(), content: body.content },
      });

      await recordAdminAction({
        actorId: authReq.authUser!.id,
        action: "content.page_update",
        entityType: "SiteContent",
        entityId: page.id,
        metadata: { title: page.title },
      });

      res.json({ data: page });
    } catch (error) {
      next(error);
    }
  },
);
