import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import connectToMongo from "./src/db.js";
import authRouter from "./src/router/authRoute.js";
import vpnRouter from "./src/router/vpnRoute.js";
import webhookRouter from "./src/router/webhookRoute.js";
import { AuthApi } from "./src/middleware/AuthApi.js";
import formatSeconds from "./src/utils/formatSeconds.js";

dotenv.config();

const app = express();
app.set("trust proxy", true); // Trust the X-Forwarded-* headers from Caddy so rate limiting tracks real IPs
const port = process.env.PORT || 5000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const rateLimitWindowMs = parsePositiveInteger(
  process.env.RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const rateLimitMax = parsePositiveInteger(process.env.RATE_LIMIT_MAX, 100);

app.use(
  "/api",
  rateLimit({
    windowMs: rateLimitWindowMs,
    limit: rateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
  }),
);

app.use(express.json());
app.use(cookieParser());

// CORS: Allow credentials for cookie-based auth
if (process.env.NODE_ENV !== "production") {
  app.use(
    cors({
      origin: "http://localhost:5173",
      credentials: true,
    }),
  );
} else {
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : true,
      credentials: true,
    }),
  );
}

// Wait for the cached MongoDB connection before handling requests
app.use(async (req, res, next) => {
  try {
    await connectToMongo();
    next();
  } catch (error) {
    next(error);
  }
});

// Health check / uptime endpoint (public)
app.get("/", (req, res) => {
  res.json({
    uptime: process.uptime(),
    uptimeFormatted: formatSeconds(process.uptime()),
  });
});

// Test endpoint to verify rate limiting and IP forwarding (public)
app.get("/api/ip", (req, res) => {
  res.json({
    ip: req.ip,
    forwardedFor: req.headers["x-forwarded-for"],
  });
});

// Auth routes (public)
app.use("/api/auth", authRouter);

// Webhook routes (public — secured by WEBHOOK_SECRET)
app.use("/api", webhookRouter);

// VPN management routes (protected — requires valid JWT)
app.use("/api", AuthApi, vpnRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found", success: false });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Unhandled application error:", error);

  if (res.headersSent) {
    return next(error);
  }

  const isDatabaseError =
    error.name?.startsWith("Mongo") ||
    error.name === "MongooseServerSelectionError";
  return res.status(isDatabaseError ? 503 : 500).json({
    message: isDatabaseError
      ? "Database temporarily unavailable"
      : "Internal server error",
    success: false,
  });
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const startServer = async () => {
  try {
    await connectToMongo();
    app.listen(port, () => {
      console.log(`=========================================`);
      console.log(`VpnHood API Running`);
      console.log(`Port: ${port}`);
      console.log(
        `Storage Path: ${process.env.STORAGE_PATH || "/opt/VpnHoodServer/storage/access"}`,
      );
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exitCode = 1;
  }
};

const shutdown = (signal) => {
  console.log(`${signal} received; shutting down server.`);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
