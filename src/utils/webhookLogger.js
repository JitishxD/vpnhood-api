import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "webhook.log");

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const getTimestamp = () => {
  return new Date().toISOString();
};

const formatLogEntry = (level, message, details = null) => {
  let entry = `[${getTimestamp()}] [${level}] ${message}`;
  if (details) {
    entry += `\n${details
      .split("\n")
      .map((line) => `  | ${line}`)
      .join("\n")}`;
  }
  return entry;
};

const SEPARATOR = "═".repeat(60);

export const webhookLogger = {
  start() {
    const entry = `\n${SEPARATOR}\n[${getTimestamp()}] 🚀 WEBHOOK UPDATE TRIGGERED\n${SEPARATOR}`;
    fs.appendFileSync(LOG_FILE, entry + "\n");
  },

  step(stepName, output = null) {
    const entry = formatLogEntry("STEP", stepName, output);
    fs.appendFileSync(LOG_FILE, entry + "\n");
  },

  success(message, output = null) {
    const entry = formatLogEntry("✅ OK", message, output);
    fs.appendFileSync(LOG_FILE, entry + "\n");
  },

  error(message, error = null) {
    const errorDetails = error
      ? error.stderr || error.message || String(error)
      : null;
    const entry = formatLogEntry("❌ ERR", message, errorDetails);
    fs.appendFileSync(LOG_FILE, entry + "\n");
  },

  end(status) {
    const icon = status === "SUCCESS" ? "✅" : "❌";
    const entry = `[${getTimestamp()}] ${icon} UPDATE ${status}\n${SEPARATOR}\n`;
    fs.appendFileSync(LOG_FILE, entry + "\n");
  },
};
