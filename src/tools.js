import { Type } from "@google/genai";
import { getDb } from "./db.js";

// Tool Declarations: Schema seen by the Gemini model
export const toolDeclarations = [
  {
    name: "get_current_time",
    description: "Get the current date and time. Use when the user asks about today's date or the time in a specific or default timezone.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        timezone: {
          type: Type.STRING,
          description: "IANA timezone, e.g. Asia/Kolkata, America/New_York, Asia/Tokyo. Defaults to Asia/Kolkata.",
        },
      },
    },
  },
  {
    name: "calculate",
    description: "Evaluate a math expression using + - * / % ( ) and decimals. Use for any arithmetic or calculations.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: {
          type: Type.STRING,
          description: "Math expression to evaluate, e.g. '(1250 * 18) / 100'",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "save_note",
    description: "Save a note or reminder the user wants to remember for later.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: "The note content to store",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "list_notes",
    description: "List all notes and reminders the user has saved previously in this session.",
  },
];

// Tool Runner: Execution logic on the server
export async function runTool(name, args = {}, sessionId) {
  switch (name) {
    case "get_current_time": {
      const timeZone = args.timezone || "Asia/Kolkata";
      try {
        const now = new Date().toLocaleString("en-IN", { timeZone });
        return { now, timeZone };
      } catch (err) {
        return { error: `Invalid timezone: ${timeZone}` };
      }
    }

    case "calculate": {
      const expr = String(args.expression ?? "").trim();
      if (expr.length > 200 || !/^[0-9+\-*/().%\s]+$/.test(expr)) {
        return { error: "Expression must be under 200 characters and contain only digits and + - * / % ( )" };
      }
      try {
        const value = Function('"use strict"; return (' + expr + ')')();
        if (!Number.isFinite(value)) {
          return { error: "Result is not a finite number" };
        }
        return { value };
      } catch (err) {
        return { error: `Evaluation error: ${err.message}` };
      }
    }

    case "save_note": {
      const text = String(args.text ?? "").trim();
      if (!text) {
        return { error: "Note text cannot be empty" };
      }
      const createdAt = new Date();
      await getDb().collection("notes").insertOne({
        sessionId,
        text,
        createdAt,
      });
      return { saved: true };
    }

    case "list_notes": {
      const notes = await getDb()
        .collection("notes")
        .find({ sessionId })
        .sort({ createdAt: 1 })
        .toArray();
      return {
        notes: notes.map((n) => ({
          text: n.text,
          savedAt: n.createdAt,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
