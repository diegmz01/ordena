import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma, type Role, type User } from "@ordena/database";
import { AppError } from "./error-handler";
import { getJwtSecret } from "../utils/jwt";
import { readBearerOrCookieToken } from "../utils/session-cookie";

export interface AuthPayload {
  sub: string;
  email: string;
  role: Role;
  branchId?: string | null;
}

export interface AuthenticatedRequest extends Request {
  authUser?: User;
  token?: string;
}

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = readBearerOrCookieToken(req);
    if (!token) {
      throw new AppError(401, "Missing or invalid authorization");
    }

    const payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
    if (!payload.sub) {
      throw new AppError(401, "Invalid token payload");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError(401, "User not found");
    }

    req.authUser = user;
    req.token = token;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, "Invalid or expired token"));
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = readBearerOrCookieToken(req);
  if (!token) {
    return next();
  }
  return authenticate(req, res, next);
}

export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return next(new AppError(401, "Unauthorized"));
    }
    if (!roles.includes(req.authUser.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }
    return next();
  };
}

export const requireAdmin = requireRole("ADMIN");
export const requireBranchStaff = requireRole("ADMIN", "BRANCH_STAFF");
