import crypto from "node:crypto";
import express from "express";
import { connectDb } from "./db.js";
import { runAgent } from "./agent.js";

// Startup check: Exit if required environment variables are missing
const requiredEnv = ["GEMINI_API_KEY", "MONGODB_URI", "APP_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Startup error: Missing required environment variable(s): ${missingEnv.join(", ")}`);
  process.exit(1);
}

const app = express();

app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Constant-time key comparison to prevent timing attacks
function timingSafeCompare(providedKey, secret) {
  if (typeof providedKey !== "string" || typeof secret !== "string") {
    return false;
  }
  const providedBuf = Buffer.from(providedKey);
  const secretBuf = Buffer.from(secret);

  if (providedBuf.length !== secretBuf.length) {
    // Dummy comparison to prevent timing leak on length difference
    crypto.timingSafeEqual(secretBuf, secretBuf);
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, secretBuf);
}

// Protected chat endpoint
app.post("/chat", async (req, res) => {
  const apiKey = req.get("x-api-key");
  if (!apiKey || !timingSafeCompare(apiKey, process.env.APP_SECRET)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { sessionId = "default", message } = req.body ?? {};

  // Validate input: message must be a non-empty string, max 4000 characters
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required and must be a non-empty string" });
  }

  const sanitizedSessionId = String(sessionId).slice(0, 64);
  const sanitizedMessage = message.trim().slice(0, 4000);

  try {
    const reply = await runAgent(sanitizedSessionId, sanitizedMessage);
    res.json({ reply });
  } catch (err) {
    console.error("Agent error:", err);
    res.status(500).json({ error: "Agent failed. Check server logs." });
  }
});

const port = process.env.PORT || 3000;
await connectDb();
app.listen(port, () => {
  console.log(`Agent running on port ${port}`);
});
