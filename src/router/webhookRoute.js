import express from "express";
import { exec } from "child_process";
import util from "util";
import dotenv from "dotenv";

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
      message: "Update initiated. Server will pull changes and restart.",
    });

    // Run the update sequence asynchronously
    setTimeout(async () => {
      try {
        console.log("--- Webhook Triggered: Updating Server ---");
        console.log("Executing git pull...");
        await execAsync("git pull");

        console.log("Executing npm install...");
        await execAsync("npm install");

        console.log("Update complete. Restarting via PM2 (Process Exit)...");
        // Exiting the process will cause PM2 to automatically restart it with the new code
        process.exit(0);
      } catch (err) {
        console.error("Failed during auto-update sequence:", err);
      }
    }, 1000);
  } catch (error) {
    console.error("Webhook error:", error);
  }
});

export default router;
