require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(API_KEY), model: MODEL });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: "Gemini API key missing. Add GEMINI_API_KEY to your .env file and restart the server." });
    }
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Please send at least one message." });
    }
    if (messages.length > 40) {
      return res.status(400).json({ error: "This conversation is too long. Start a new chat." });
    }

    const contents = messages.map(message => {
      if (!["user", "assistant"].includes(message.role) || typeof message.text !== "string") {
        throw new Error("Invalid message format.");
      }
      return {
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.text.slice(0, 12000) }]
      };
    });

    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are NEXA, a helpful, clear, friendly AI assistant. Answer accurately. If the user writes in Hinglish or Hindi, respond in the same language. Use Markdown formatting when it improves readability." }]
          },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    const result = await apiResponse.json();
    if (!apiResponse.ok) {
      const apiMessage = result?.error?.message || "Gemini API request failed.";
      return res.status(apiResponse.status).json({ error: apiMessage });
    }
    const reply = result?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) return res.status(502).json({ error: "The AI returned an empty response. Please try again." });
    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ error: error.message || "Internal server error." });
  }
});

app.listen(PORT, () => {
  console.log(`NEXA AI is running at http://localhost:${PORT}`);
  if (!API_KEY) console.log("Add GEMINI_API_KEY to .env to enable AI replies.");
});
