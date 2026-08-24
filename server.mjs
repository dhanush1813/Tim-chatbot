import "dotenv/config";
import express from "express";

const app = express();
const port = 3001;

app.use(express.json());

app.post("/api/chat", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing from .env",
    });
  }

  try {
    const body = req.body;
    const contents = (body.messages || []).map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: Array.isArray(message.content)
            ? message.content
                .map((item) => (typeof item === "string" ? item : item.text || ""))
                .join("")
            : message.content || "",
        },
      ],
    }));

    const requestBody = {
      contents,
      generationConfig: {
        maxOutputTokens: body.max_tokens || 1024,
        temperature: body.temperature ?? 0.7,
      },
    };

    if (body.system) {
      requestBody.systemInstruction = {
        parts: [
          {
            text: typeof body.system === "string" ? body.system : JSON.stringify(body.system),
          },
        ],
      };
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        encodeURIComponent(process.env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json(data);
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";

    res.json({
      id: data.responseId || `gemini-${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text,
        },
      ],
      model: "gemini-3.6-flash",
      stop_reason: "end_turn",
    });
  } catch (error) {
    console.error("Gemini request failed:", error);

    res.status(502).json({
      error: "Could not reach Gemini.",
    });
  }
});

app.post("/api/detect-mood", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing" });
  }

  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    // Build conversation context
    const conversationContext = history
      .slice(-4) // Last 4 messages for context
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");

    const fullPrompt = conversationContext 
      ? `${conversationContext}\nUser: ${message}`
      : `User: ${message}`;

    // Prepare request to Gemini
    const requestBody = {
      contents: [{
        parts: [{
          text: `You are an emotion classifier. Analyze the user's message and classify their emotional tone into exactly one of: happy, excited, sad, angry, anxious, neutral.

Consider sarcasm, negation, punctuation/caps, and previous conversation context as real signals.

Respond with ONLY raw JSON, no other text:
{"mood": "<one of the moods>", "confidence": <0 to 1>}

Conversation:
${fullPrompt}`
        }]
      }],
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.3
      }
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        encodeURIComponent(process.env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      throw new Error("Mood detection failed");
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!["happy", "excited", "sad", "angry", "anxious", "neutral"].includes(parsed.mood)) {
      throw new Error("Invalid mood value");
    }

    res.json({
      mood: parsed.mood,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5))
    });

  } catch (error) {
    console.error("Mood detection error:", error);
    res.status(500).json({ 
      error: "Could not detect mood",
      mood: "neutral",
      confidence: 0.3
    });
  }
});

app.listen(port, () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
});