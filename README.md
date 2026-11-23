# Personal AI Agent

> [!NOTE]
> **Educational & Learning Purpose**: This project was built for learning and educational purposes to demonstrate how to build an autonomous AI agent from scratch using Node.js, Express 5, Google Gemini tool calling, and MongoDB Atlas memory storage.

A personal AI agent built with Node.js and Express 5 that talks to the Google Gemini API, supports multi-turn tool calling in an autonomous loop, persists conversation memory and notes in MongoDB Atlas, and serves a self-contained chat web interface. Designed to be completely free to host on Render.

## Project Architecture & Features

- **Runtime**: Node.js (>= 20.11), ES Modules (`"type": "module"`).
- **Web Server**: Express 5 serving a REST API and static chat UI.
- **LLM Brain**: Google Gemini via the official `@google/genai` SDK.
- **Autonomous Tool Loop**: Executes multi-step workflows, math evaluations, time queries, and note operations.
- **Memory & Persistence**: MongoDB Atlas (free M0 tier) storing conversation history and notes.
- **Security**:
  - Constant-time secret verification (`crypto.timingSafeEqual`) on `x-api-key` header matching `APP_SECRET`.
  - Request body limits (20kb) and input validation (messages up to 4000 chars, session IDs up to 64 chars).
  - Whitelist-enforced mathematical expression evaluator (no arbitrary code execution).
  - Tool output truncation (capped at 8000 characters) to avoid context blowup.
  - Zero hardcoded secrets, `.env` strictly ignored by Git.

## Folder Structure

```text
.
├── .env.example        # Environment variable template (committed)
├── .gitignore          # Ignores node_modules and .env
├── package.json        # Project metadata, dependencies, scripts, engines
├── public/
│   └── index.html      # Responsive chat interface (Light/Dark mode, no frameworks)
├── src/
│   ├── server.js       # Express server, health check, authentication, input validation
│   ├── agent.js        # Core agent loop, model calls with 429/503 exponential backoff
│   ├── tools.js        # Tool declarations and server execution logic
│   ├── memory.js       # Conversation history loading and turn persistence
│   └── db.js           # MongoDB Atlas connection manager and collection indexes
└── README.md
```

## Environment Variables (.env)

Create a `.env` file in the project root based on `.env.example`:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google AI Studio API key. |
| `GEMINI_MODEL` | Gemini model name (e.g., `gemini-3.5-flash-lite` or `gemini-3.8-flash`). |
| `MONGODB_URI` | MongoDB Atlas connection URI (`mongodb+srv://...`). Special characters in password must be URL-encoded. |
| `APP_SECRET` | Secret token used to protect `POST /chat` via the `x-api-key` header. |
| `PORT` | Local port number (defaults to `3000`). On Render, this is provided automatically. |

## Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Start the development server with live reload**:
   ```bash
   npm run dev
   ```
3. **Start the production server**:
   ```bash
   npm start
   ```
4. **Open in browser**:
   Navigate to `http://localhost:3000`. Enter your `APP_SECRET` in the header bar and start chatting.

## Built-In Tools

1. **`get_current_time`**:
   - Fetches formatted date and time for any IANA timezone (defaults to `Asia/Kolkata`).
   - Gracefully handles invalid timezones by returning an error object rather than throwing.
2. **`calculate`**:
   - Evaluates arithmetic expressions (`+`, `-`, `*`, `/`, `%`, parentheses, decimals).
   - Validates expressions against a strict regex whitelist (`/^[0-9+\-*/().%\s]+$/`) before evaluation. Rejects non-finite results.
3. **`save_note`**:
   - Saves text notes linked to the current `sessionId` with a timestamp into MongoDB.
4. **`list_notes`**:
   - Retrieves all notes stored for the current session, sorted oldest first.
5. **`get_weather`**:
   - Geocodes any city via Open-Meteo Geocoding API and retrieves current weather conditions (temperature, apparent temperature, humidity, wind speed, condition description) without an API key.
6. **`fetch_url`**:
   - Safely reads and extracts text content from public web pages (HTTP and HTTPS).
   - Includes basic SSRF protection blocking localhost and private network addresses (IPv4 ranges, `.internal`, `.local`), enforces a 10-second timeout, strips HTML/CSS/JS, collapses whitespace, and caps output at 8000 characters.

## How to Add a New Tool

Adding a tool requires two changes in [`src/tools.js`](src/tools.js):

1. **Add declaration to `toolDeclarations`**:
   Define the tool schema using `Type` from `@google/genai` with a clear description so the model understands when to invoke it.
   ```javascript
   {
     name: "my_tool",
     description: "Clear description explaining what this tool does and when to call it.",
     parameters: {
       type: Type.OBJECT,
       properties: {
         query: { type: Type.STRING, description: "Parameter description" },
       },
       required: ["query"],
     },
   }
   ```
2. **Add execution logic in `runTool`**:
   Add a `case` inside the `switch (name)` block:
   ```javascript
   case "my_tool": {
     const query = String(args.query || "");
     // perform tool logic...
     return { result: "..." };
   }
   ```

## Deploying for Free on Render

1. Push your repository to GitHub (ensure `.env` is never committed).
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   - **Name**: `my-personal-agent` (or any name you choose)
   - **Region**: Choose the region closest to you
   - **Branch**: `main` (or `master`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. **Environment Variables**:
   Under **Environment Variables**, add the following 4 variables:
   - `GEMINI_API_KEY`: *(Your Gemini API key)*
   - `GEMINI_MODEL`: `gemini-3.5-flash-lite` (or `gemini-3.8-flash`)
   - `MONGODB_URI`: *(Your MongoDB Atlas connection URI)*
   - `APP_SECRET`: *(Your shared secret string)*
   > **Note**: Do **NOT** set `PORT`. Render automatically injects the correct port in production.
6. Click **Create Web Service**.
7. Once deployed, open your Render URL (e.g., `https://my-personal-agent.onrender.com`), enter your `APP_SECRET`, and use your agent!
