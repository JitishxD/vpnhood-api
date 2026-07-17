import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const STORAGE_PATH =
  process.env.STORAGE_PATH || "/opt/VpnHoodServer/storage/access";

/**
 * Utility function to parse local VpnHood token files and merge them with their usage statistics
 */
export async function getTokens() {
  try {
    const files = await fs.readdir(STORAGE_PATH);
    const tokenFiles = files.filter((f) => f.endsWith(".token2"));

    const tokens = [];

    for (const tokenFile of tokenFiles) {
      const tokenId = tokenFile.replace(".token2", "");

      try {
        const tokenContent = await fs.readFile(
          path.join(STORAGE_PATH, tokenFile),
          "utf-8",
        );
        const tokenData = JSON.parse(tokenContent);

        let usageData = { Sent: 0, Received: 0, LastUsedTime: null };
        try {
          const usageContent = await fs.readFile(
            path.join(STORAGE_PATH, `${tokenId}.usage`),
            "utf-8",
          );
          usageData = JSON.parse(usageContent);
        } catch (e) {
          // Usage file might not exist yet if the token has never been used
        }

        tokens.push({
          tokenId,
          name: tokenData.Name,
          maxTraffic: tokenData.MaxTraffic,
          maxClientCount: tokenData.MaxClientCount,
          maxSpeedMbps: tokenData.MaxSpeedMbps,
          issuedAt: tokenData.IssuedAt,
          expirationTime: tokenData.ExpirationTime,
          usage: usageData,
        });
      } catch (e) {
        console.error(`Error reading token data for ${tokenId}:`, e);
      }
    }

    return tokens;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(
        `Storage path not found: ${STORAGE_PATH}. Returning empty list.`,
      );
      return [];
    }
    throw error;
  }
}
