import { MongoClient } from "mongodb";

let db;

export async function connectDb() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db("agent");
  await db.collection("messages").createIndex({ sessionId: 1, createdAt: 1 });
  await db.collection("notes").createIndex({ sessionId: 1 });
  console.log("MongoDB connected");
}

export function getDb() {
  if (!db) {
    throw new Error("Database not connected yet");
  }
  return db;
}
