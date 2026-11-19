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
  {
    name: "get_weather",
    description: "Get the current weather conditions for a city using Open-Meteo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: {
          type: Type.STRING,
          description: "The city name, e.g. Tokyo, London, Mumbai, Paris",
        },
      },
      required: ["city"],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch and extract clean text content from a public web page (http/https).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: "The full http or https web URL to read",
        },
      },
      required: ["url"],
    },
  },
];

// Weather code description mapper (WMO weather interpretation codes)
function getWeatherDescription(code) {
  const codes = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
  };
  return codes[code] || `Weather code ${code}`;
}

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

    case "get_weather": {
      const city = String(args.city ?? "").trim();
      if (!city) {
        return { error: "City name is required" };
      }

      try {
        // Step 1: Geocoding via Open-Meteo
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(10000) });
        if (!geoRes.ok) {
          return { error: `Geocoding request failed with status ${geoRes.status}` };
        }
        const geoData = await geoRes.json();
        if (!geoData.results || geoData.results.length === 0) {
          return { error: `City '${city}' not found` };
        }

        const { name: resolvedCity, country, latitude, longitude } = geoData.results[0];

        // Step 2: Current weather conditions
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`;
        const weatherRes = await fetch(forecastUrl, { signal: AbortSignal.timeout(10000) });
        if (!weatherRes.ok) {
          return { error: `Weather request failed with status ${weatherRes.status}` };
        }
        const weatherData = await weatherRes.json();
        const current = weatherData.current || {};

        return {
          city: resolvedCity,
          country: country || "Unknown",
          conditions: getWeatherDescription(current.weather_code),
          temperature: `${current.temperature_2m ?? "N/A"}°C`,
          apparent_temperature: `${current.apparent_temperature ?? "N/A"}°C`,
          humidity: `${current.relative_humidity_2m ?? "N/A"}%`,
          wind_speed: `${current.wind_speed_10m ?? "N/A"} km/h`,
        };
      } catch (err) {
        return { error: `Weather error: ${err.message}` };
      }
    }

    case "fetch_url": {
      const rawUrl = String(args.url ?? "").trim();
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return { error: "Invalid URL format" };
      }

      // Restrict protocol to HTTP and HTTPS
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "Only http and https URLs are allowed" };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Note: This hostname blocklist is basic protection only against SSRF (private / local network access)
      const isBlocked =
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        hostname === "::1" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

      if (isBlocked) {
        return { error: "Access to private or local network addresses is prohibited" };
      }

      try {
        const response = await fetch(parsed.toString(), {
          signal: AbortSignal.timeout(10000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PersonalAgent/1.0",
            Accept: "text/html,application/xhtml+xml,text/plain",
          },
        });

        if (!response.ok) {
          return { error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}` };
        }

        const html = await response.text();

        // Strip scripts, styles, SVG, and HTML tags
        let text = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
          .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
          .replace(/<[^>]+>/g, " ");

        // Collapse whitespace
        text = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

        // Limit to 8000 characters
        if (text.length > 8000) {
          text = text.slice(0, 8000) + "... [truncated]";
        }

        return {
          url: parsed.toString(),
          content: text || "(Empty page content)",
        };
      } catch (err) {
        return { error: `Fetch error: ${err.message}` };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
