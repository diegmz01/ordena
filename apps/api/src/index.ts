import "./env";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { authRouter } from "./routes/auth";
import { branchesRouter } from "./routes/branches";
import { menuRouter } from "./routes/menu";
import { checkoutRouter } from "./routes/checkout";
import { ordersRouter } from "./routes/orders";
import { customersRouter } from "./routes/customers";
import { pushRouter } from "./routes/push";
import { stripeWebhookRouter } from "./routes/stripe-webhook";
import { healthRouter } from "./routes/health";
import { financeRouter } from "./routes/finance";
import { settingsRouter } from "./routes/settings";
import { contentRouter } from "./routes/content";
import { errorHandler } from "./middleware/error-handler";
import { globalRateLimiter } from "./middleware/rate-limit";
import { assertProductionEnv, corsOrigins } from "./utils/env";
import { startPromoteReadyOrdersJob } from "./jobs/promote-ready-orders-job";
import { startEscalateUnacceptedOrdersJob } from "./jobs/escalate-unaccepted-orders-job";
import { startBranchStatusSnapshotJob } from "./jobs/branch-status-snapshot-job";
import { startHandleStalePaidOrdersJob } from "./jobs/handle-stale-paid-orders-job";
import { startStaleActiveOrdersJob } from "./jobs/stale-active-orders-job";
import { startReconcilePendingCheckoutsJob } from "./jobs/reconcile-pending-checkouts-job";
import { initSentry } from "./utils/sentry";

initSentry();
assertProductionEnv();

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins(),
    credentials: true,
  }),
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(cookieParser());

// Stripe webhook needs raw body — mount before json parser
app.use("/stripe/webhook", stripeWebhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/health", healthRouter);

// Red de contención por defecto para todo lo que sigue (auth/checkout
// ya tienen sus propios limiters más estrictos; este es el piso general).
app.use(globalRateLimiter);

app.use("/auth", authRouter);
app.use("/branches", branchesRouter);
app.use("/menu", menuRouter);
app.use("/checkout", checkoutRouter);
app.use("/orders", ordersRouter);
app.use("/customers", customersRouter);
app.use("/push", pushRouter);
app.use("/finance", financeRouter);
app.use("/settings", settingsRouter);
app.use("/content", contentRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

startPromoteReadyOrdersJob();
startEscalateUnacceptedOrdersJob();
startBranchStatusSnapshotJob();
startHandleStalePaidOrdersJob();
startStaleActiveOrdersJob();
startReconcilePendingCheckoutsJob();
