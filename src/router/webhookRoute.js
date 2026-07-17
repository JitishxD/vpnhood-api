import express from "express";
import { exec } from "child_process";
import util from "util";
import dotenv from "dotenv";
import { webhookLogger } from "../utils/webhookLogger.js";

dotenv.config();

const execAsync = util.promisify(exec);
const router = express.Router();

/**
 * @route   POST /webhook/update
 * @desc    Auto-updater endpoint. Pulls latest code from Git and restarts the API.
 * @body    { secret: string }
 */
router.post("/webhook/update", async (req, res) => {
  const { secret } = req.body;
  const configuredSecret = process.env.WEBHOOK_SECRET;
  const upstreamRepo = process.env.UPSTREAM_REPO;

  if (!configuredSecret || secret !== configuredSecret) {
    return res
      .status(403)
      .json({ success: false, error: "Invalid or missing webhook secret" });
  }

  if (!upstreamRepo) {
    return res.status(500).json({
      success: false,
      error: "UPSTREAM_REPO is not configured in .env",
    });
  }

  try {
    // Send success response immediately before we kill the process
    res.json({
      success: true,
      message:
        "Update initiated. Server will pull changes and restart. Check logs/webhook.log for details.",
    });

    // Run the update sequence asynchronously
    setTimeout(async () => {
      webhookLogger.start();

      try {
        // Step 1: Git Pull
        webhookLogger.step("Executing git pull...");
        const gitResult = await execAsync("git pull");
        webhookLogger.success("git pull completed", gitResult.stdout.trim());

        // Step 2: npm install
        webhookLogger.step("Executing npm install...");
        const npmResult = await execAsync("npm install");
        webhookLogger.success("npm install completed", npmResult.stdout.trim());

        // Step 3: Restart
        webhookLogger.step("Restarting server via PM2 (process.exit)...");
        webhookLogger.end("SUCCESS");

        // Exiting the process will cause PM2 to automatically restart it with the new code
        process.exit(0);
      } catch (err) {
        webhookLogger.error("Update sequence failed", err);
        webhookLogger.end("FAILED");
      }
    }, 1000);
  } catch (error) {
    console.error("Webhook error:", error);
  }
});

export default router;
