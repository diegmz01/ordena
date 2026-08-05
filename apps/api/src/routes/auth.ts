import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@ordena/database";
import {
  loginSchema,
  registerSchema,
  updateCustomerPhoneSchema,
  type AuthUser,
  type LoginResponse,
} from "@ordena/shared";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { getJwtSecret } from "../utils/jwt";
import {
  OAUTH_COOKIE,
  buildAuthorizationUrl,
  consumeOneTimeCode,
  createOneTimeCode,
  exchangeCodeForProfile,
  getConfiguredProviders,
  isOAuthProviderSlug,
  oauthErrorRedirect,
  oauthSuccessRedirect,
  readOAuthStateCookie,
  sanitizeNext,
  upsertOAuthUser,
} from "../lib/oauth";
import { authRateLimiter, loginRateLimiter } from "../middleware/rate-limit";
import {
  clearSessionCookie,
  resolveAudience,
  setSessionCookie,
  type AuthAudience,
} from "../utils/session-cookie";

export const authRouter = Router();

const SESSION_TTL = "7d";

function toAuthUser(user: {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  role: AuthUser["role"];
  branchId: string | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    role: user.role,
    branchId: user.branchId,
  };
}

function audienceForRole(role: AuthUser["role"]): AuthAudience {
  if (role === "ADMIN") return "admin";
  if (role === "BRANCH_STAFF") return "branch";
  return "customer";
}

function issueToken(user: {
  id: string;
  email: string;
  role: AuthUser["role"];
  branchId: string | null;
  name: string | null;
  phone?: string | null;
}): LoginResponse {
  const access_token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    },
    getJwtSecret(),
    { expiresIn: SESSION_TTL },
  );
  return { access_token, user: toAuthUser(user) };
}

function issueSession(
  req: import("express").Request,
  res: import("express").Response,
  user: {
    id: string;
    email: string;
    role: AuthUser["role"];
    branchId: string | null;
    name: string | null;
    phone?: string | null;
  },
) {
  const payload = issueToken(user);
  const audience =
    resolveAudience(req) !== "customer"
      ? resolveAudience(req)
      : audienceForRole(user.role);
  setSessionCookie(res, payload.access_token, audience);
  return payload;
}

function setOAuthCookie(
  res: import("express").Response,
  value: string,
) {
  res.cookie(OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/auth/oauth",
  });
}

function clearOAuthCookie(res: import("express").Response) {
  res.clearCookie(OAUTH_COOKIE, { path: "/auth/oauth" });
}

authRouter.post("/login", authRateLimiter, loginRateLimiter, async (req, res, next) => {
  try {
    const { email, password, expectedRole } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user?.passwordHash) {
      throw new AppError(401, "Correo o contraseña incorrectos");
    }

    if (expectedRole && user.role !== expectedRole) {
      throw new AppError(403, "Esta cuenta no tiene el rol requerido");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "Correo o contraseña incorrectos");
    }

    res.json(issueSession(req, res, user));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/register", authRateLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, "Ya existe una cuenta con ese email");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email,
        phone: data.phone,
        passwordHash,
        role: "CUSTOMER",
      },
    });

    res.status(201).json(issueSession(req, res, user));
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  res.json({ user: toAuthUser(req.authUser!) });
});

authRouter.patch("/me/phone", authenticate, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.authUser!.role !== "CUSTOMER") {
      throw new AppError(403, "Solo clientes pueden actualizar este dato");
    }

    const { phone } = updateCustomerPhoneSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: authReq.authUser!.id },
      data: { phone: phone.trim() },
    });

    res.json({ user: toAuthUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (req, res) => {
  clearSessionCookie(res, resolveAudience(req));
  res.json({ ok: true });
});

authRouter.get("/oauth/providers", (_req, res) => {
  res.json({ providers: getConfiguredProviders() });
});

authRouter.get("/oauth/:provider/start", async (req, res, next) => {
  try {
    const providerParam = String(req.params.provider ?? "");
    if (!isOAuthProviderSlug(providerParam)) {
      throw new AppError(404, "Provider no soportado");
    }

    const { url, cookieValue } = await buildAuthorizationUrl(
      providerParam,
      sanitizeNext(req.query.next),
    );
    setOAuthCookie(res, cookieValue);
    res.redirect(url.toString());
  } catch (error) {
    next(error);
  }
});

async function handleOAuthCallback(
  req: import("express").Request,
  res: import("express").Response,
  _next: import("express").NextFunction,
) {
  let nextPath = "/";
  try {
    const providerParam = String(req.params.provider ?? "");
    if (!isOAuthProviderSlug(providerParam)) {
      throw new AppError(404, "Provider no soportado");
    }

    const code =
      typeof req.body?.code === "string"
        ? req.body.code
        : typeof req.query.code === "string"
          ? req.query.code
          : null;
    const state =
      typeof req.body?.state === "string"
        ? req.body.state
        : typeof req.query.state === "string"
          ? req.query.state
          : null;
    const oauthError =
      typeof req.body?.error === "string"
        ? req.body.error
        : typeof req.query.error === "string"
          ? req.query.error
          : null;

    const stored = readOAuthStateCookie(req.cookies?.[OAUTH_COOKIE]);
    nextPath = stored.next;

    if (oauthError) {
      clearOAuthCookie(res);
      return res.redirect(
        oauthErrorRedirect("Autorización cancelada o denegada", nextPath),
      );
    }

    if (!code || !state || state !== stored.state) {
      throw new AppError(400, "Parámetros OAuth inválidos");
    }
    if (stored.provider !== providerParam) {
      throw new AppError(400, "Provider OAuth no coincide");
    }

    const appleUser =
      typeof req.body?.user === "string" ? req.body.user : null;

    const profile = await exchangeCodeForProfile(
      providerParam,
      code,
      stored.codeVerifier,
      appleUser,
    );
    const user = await upsertOAuthUser(providerParam, profile);
    const otp = await createOneTimeCode(user.id);

    clearOAuthCookie(res);
    return res.redirect(oauthSuccessRedirect(otp, nextPath));
  } catch (error) {
    clearOAuthCookie(res);
    const message =
      error instanceof AppError
        ? error.message
        : "No se pudo completar el inicio de sesión";
    return res.redirect(oauthErrorRedirect(message, nextPath));
  }
}

authRouter.get("/oauth/:provider/callback", handleOAuthCallback);
authRouter.post("/oauth/:provider/callback", handleOAuthCallback);

authRouter.post("/oauth/exchange", authRateLimiter, async (req, res, next) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code) throw new AppError(400, "Código requerido");

    const userId = await consumeOneTimeCode(code);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "CUSTOMER") {
      throw new AppError(400, "Código OAuth inválido o expirado");
    }

    res.json(issueSession(req, res, user));
  } catch (error) {
    next(error);
  }
});
