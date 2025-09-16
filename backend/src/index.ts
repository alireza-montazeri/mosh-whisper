import express from "express";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";

import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors({ origin: ["http://localhost:5173"] })); // Vite dev
app.use(express.json());

// 1) Mint an ephemeral token for the browser (Live API only, v1alpha)
app.post("/api/ephemeral", async (_req, res) => {
  try {
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
      // not required here, but fine to keep consistent:
      httpOptions: { apiVersion: "v1alpha" },
    });

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30m
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString(); // 1m

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: { apiVersion: "v1alpha" },
        // Lock token to your Live model and default config (safer)
        liveConnectConstraints: {
          model: "gemini-2.0-flash-live-001", // or 'gemini-live-2.5-flash-preview'
          config: {
            responseModalities: [Modality.TEXT],
            sessionResumption: {},
          },
        },
      },
    });

    // IMPORTANT: send back token.name (the ephemeral token value)
    res.json({ token: token.name });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 2) Handle tool call result from the client
app.post("/api/tools/submit-intake", async (req, res) => {
  const payload = req.body; // { category, answers, unknowns?, red_flags? }
  console.log("[submit_intake]", JSON.stringify(payload, null, 2));

  // TODO: map to FHIR QuestionnaireResponse & persist (DynamoDB/Postgres)
  // For demo, just echo success:
  res.json({ ok: true, received: payload, reviewId: "demo-123" });
});

const PORT = process.env.PORT || 8585;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
