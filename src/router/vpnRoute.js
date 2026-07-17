import express from "express";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";
import dotenv from "dotenv";
import { getTokens } from "../utils/vpnhoodUtil.js";

dotenv.config();

const execAsync = util.promisify(exec);
const router = express.Router();

const STORAGE_PATH =
  process.env.STORAGE_PATH || "/opt/VpnHoodServer/storage/access";
const VH_SERVER_CMD =
  process.env.VH_SERVER_CMD || "sudo /opt/VpnHoodServer/vhserver";

// API ROUTES

/**
 * @route   GET /users
 * @desc    Get a list of all VPN users and their usage statistics
 */
router.get("/users", async (req, res) => {
  try {
    const tokens = await getTokens();
    res.json({ success: true, count: tokens.length, data: tokens });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * @route   GET /users/:tokenId
 * @desc    Get details and the vh:// connection string for a specific user
 */
router.get("/users/:tokenId", async (req, res) => {
  const { tokenId } = req.params;

  try {
    const tokens = await getTokens();
    const token = tokens.find((t) => t.tokenId === tokenId);

    if (!token) {
      return res
        .status(404)
        .json({ success: false, error: "User token not found" });
    }

    // Retrieve the actual vh:// access key using vhserver print
    let accessKey = null;
    try {
      const { stdout } = await execAsync(`${VH_SERVER_CMD} print ${tokenId}`);
      const match = stdout.match(/vh:\/\/[a-zA-Z0-9+/=]+/);
      if (match) {
        accessKey = match[0];
      }
    } catch (e) {
      console.error(`Failed to print access key for ${tokenId}`, e);
    }

    res.json({ success: true, data: { ...token, accessKey } });
  } catch (error) {
    console.error("Failed to fetch user details:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * @route   POST /users
 * @desc    Create a new VPN user/token with optional limits
 * @body    { name: string, maxTrafficMB: number, maxClient: number, maxSpeedMbps: number, expireDate: string }
 */
router.post("/users", async (req, res) => {
  const { name, maxTrafficMB, maxClient, maxSpeedMbps, expireDate } = req.body;

  if (!name || typeof name !== "string") {
    return res
      .status(400)
      .json({ success: false, error: "Valid Name is required" });
  }

  // Base command
  let cmd = `${VH_SERVER_CMD} gen -name "${name.replace(/"/g, '\\"')}"`;

  // Optional limits
  if (maxTrafficMB) cmd += ` -maxTraffic ${parseInt(maxTrafficMB)}`;
  if (maxClient) cmd += ` -maxClient ${parseInt(maxClient)}`;
  if (maxSpeedMbps) cmd += ` -maxSpeed ${parseInt(maxSpeedMbps)}`;
  if (expireDate) cmd += ` -expire "${expireDate}"`; // Format expected: YYYY/MM/DD

  try {
    const { stdout } = await execAsync(cmd);

    let accessKey = null;
    const match = stdout.match(/vh:\/\/[a-zA-Z0-9+/=]+/);
    if (match) {
      accessKey = match[0];
    }

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { accessKey },
    });
  } catch (error) {
    console.error("Failed to create user:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to execute creation command" });
  }
});

/**
 * @route   DELETE /users/:tokenId
 * @desc    Revoke a user's access by deleting their token file
 */
router.delete("/users/:tokenId", async (req, res) => {
  const { tokenId } = req.params;

  // Basic sanity check to prevent directory traversal
  if (!tokenId || !/^[a-zA-Z0-9_-]+$/.test(tokenId)) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid token ID format" });
  }

  const tokenPath = path.join(STORAGE_PATH, `${tokenId}.token2`);
  const usagePath = path.join(STORAGE_PATH, `${tokenId}.usage`);

  try {
    // Check if token exists first
    await fs.access(tokenPath);

    // Delete the token (this immediately revokes access in VpnHood)
    await fs.unlink(tokenPath);

    // Optionally delete usage tracking file if it exists
    try {
      await fs.unlink(usagePath);
    } catch (err) {
      // Ignore if usage file doesn't exist
    }

    res.json({
      success: true,
      message: `User ${tokenId} has been successfully revoked.`,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res
        .status(404)
        .json({ success: false, error: "User token not found" });
    }
    console.error("Failed to delete user:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to delete user files" });
  }
});

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
