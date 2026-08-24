import "dotenv/config";
import express from "express";

const app = express();
const port = 3001;

app.use(express.json());

app.post("/api/chat", async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY is missing from .env",
    });
  }

  try {
    const body = req.body;

    // Convert Anthropic-style messages to Groq/OpenAI-style messages.
    const messages = (body.messages || []).map((message) => ({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content
            .map((item) =>
              typeof item === "string" ? item : item.text || ""
            )
            .join("")
        : message.content || "",
    }));

    // If TIM sends a system prompt, preserve it.
    if (body.system) {
      messages.unshift({
        role: "system",
        content:
          typeof body.system === "string"
            ? body.system
            : JSON.stringify(body.system),
      });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages,
          max_tokens: body.max_tokens || 1024,
          temperature: body.temperature ?? 0.7,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", data);
      return res.status(response.status).json(data);
    }

    // Return an Anthropic-like response so the existing TIM frontend
    // doesn't need to be changed.
    const text = data.choices?.[0]?.message?.content || "";

    res.json({
      id: data.id,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text,
        },
      ],
      model: data.model,
      stop_reason: "end_turn",
    });
  } catch (error) {
    console.error("Groq request failed:", error);

    res.status(502).json({
      error: "Could not reach Groq.",
    });
  }
});

app.listen(port, () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
});