import { Router } from "express";
import { prisma } from "@ordena/database";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "ordena-api", db: "up" });
  } catch (error) {
    console.error("[health]", error);
    res.status(503).json({ ok: false, service: "ordena-api", db: "down" });
  }
});
