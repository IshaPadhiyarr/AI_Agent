import { GoogleGenAI } from "@google/genai";
import { toolDeclarations, runTool } from "./tools.js";
import { loadHistory, saveTurn } from "./memory.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_STEPS = 12;

const SYSTEM_PROMPT = `You are a helpful personal assistant. For tasks needing several steps, first write a short numbered plan then execute using tools. Use tools instead of guessing facts, time or math. If a tool fails try a different approach once then explain. If the user asks to remember something call save_note. Keep answers clear and concise.`;

const RETRY_DELAYS = [1500, 3000, 6000];

async function callModel(contents) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? err.response?.status;
      const retryable = status === 429 || status === 503;
      if (!retryable || attempt === 3) {
        throw err;
      }
      const delay = RETRY_DELAYS[attempt] ?? 6000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function truncateResult(result) {
  try {
    const serialized = JSON.stringify(result);
    if (serialized.length <= 8000) {
      return result;
    }
    return {
      truncated: true,
      preview: serialized.slice(0, 7900) + "... [truncated]",
    };
  } catch {
    return result;
  }
}

export async function runAgent(sessionId, userText) {
  const history = await loadHistory(sessionId);
  const contents = [...history, { role: "user", parts: [{ text: userText }] }];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callModel(contents);
    const calls = response.functionCalls;

    // No tool requested -> this is the final answer
    if (!calls || calls.length === 0) {
      const reply = response.text || "(no response)";
      await saveTurn(sessionId, userText, reply);
      return reply;
    }

    // Append model's thought / tool-call request candidate
    contents.push(response.candidates[0].content);

    const resultParts = [];
    for (const call of calls) {
      let rawResult;
      try {
        rawResult = await runTool(call.name, call.args ?? {}, sessionId);
      } catch (err) {
        rawResult = { error: err.message };
      }

      const result = truncateResult(rawResult);

      // Truncate long results in terminal logs
      const logStr = JSON.stringify(result);
      const truncatedLog = logStr.length > 200 ? logStr.slice(0, 200) + "..." : logStr;
      console.log(`tool: ${call.name}`, call.args, "->", truncatedLog);

      resultParts.push({
        functionResponse: {
          name: call.name,
          response: { result },
        },
      });
    }

    contents.push({ role: "user", parts: resultParts });
  }

  const fallback = "I could not complete your request within the maximum number of steps. Please try rephrasing or breaking it down.";
  await saveTurn(sessionId, userText, fallback);
  return fallback;
}
