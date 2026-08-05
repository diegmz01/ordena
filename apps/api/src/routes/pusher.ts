import { Router } from "express";
import { AppError } from "../middleware/error-handler";
import {
  authenticate,
  requireBranchStaff,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { pusherAuthRateLimiter } from "../middleware/rate-limit";
import { getPusher, parseBranchChannel } from "../utils/pusher";

export const pusherRouter = Router();

pusherRouter.post(
  "/auth",
  pusherAuthRateLimiter,
  authenticate,
  requireBranchStaff,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const socketId =
        typeof req.body?.socket_id === "string" ? req.body.socket_id : "";
      const channelName =
        typeof req.body?.channel_name === "string"
          ? req.body.channel_name
          : "";

      if (!socketId || !channelName) {
        throw new AppError(400, "socket_id y channel_name requeridos");
      }

      const branchId = parseBranchChannel(channelName);
      if (!branchId) {
        throw new AppError(403, "Canal no autorizado");
      }

      const user = req.authUser!;
      if (user.role === "BRANCH_STAFF" && user.branchId !== branchId) {
        throw new AppError(403, "Canal de otra sucursal");
      }

      if (!process.env.PUSHER_APP_ID || !process.env.NEXT_PUBLIC_PUSHER_KEY) {
        throw new AppError(503, "Pusher no está configurado");
      }

      const auth = getPusher().authorizeChannel(socketId, channelName);
      res.json(auth);
    } catch (error) {
      next(error);
    }
  },
);
