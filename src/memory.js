import { getDb } from "./db.js";

const HISTORY_LIMIT = 20; // Must stay even so history starts with a user turn

export async function loadHistory(sessionId) {
  const docs = await getDb()
    .collection("messages")
    .find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .toArray();

  return docs.reverse().map((d) => ({
    role: d.role,
    parts: [{ text: d.text }],
  }));
}

export async function saveTurn(sessionId, userText, modelText) {
  const now = Date.now();
  await getDb()
    .collection("messages")
    .insertMany([
      { sessionId, role: "user", text: userText, createdAt: new Date(now) },
      { sessionId, role: "model", text: modelText, createdAt: new Date(now + 1) },
    ]);
}
