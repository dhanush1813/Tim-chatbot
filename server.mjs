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

app.listen(port, () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
});