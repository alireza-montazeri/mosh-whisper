import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import { extractFromVoice } from "./llm/extractFromVoice";
import { connectToGeminiLive } from "./llm/live/gminiLive";
import { livePrompt } from "./llm/live/livePrompt";
import type { Extraction } from "./llm/types";

import dotenv from "dotenv";
import { applyAnswerUpdate, pickTop5Unanswered } from "./helper/helper";
dotenv.config();

// Type for the live connection (copied from gminiLive.ts)
type LiveConn = {
  sendAudio: (buf: ArrayBuffer | Buffer) => void;
  sendControl: (msg: any) => void;
  close: () => void;
  onEvent: (cb: (e: any) => void) => void;
};

// Simple in-memory session storage (replace with Redis/DB in production)
const sessionStore = new Map<string, Extraction>();

const PROMPT = livePrompt;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Multer storage to /tmp
const upload = multer({ dest: path.join(process.cwd(), "tmp/audio") });

app.get("/health-check", (_req, res) => res.send("ok"));

// POST /api/intake/recording
// form-data: audio=<file>, quizSpec=<json string>
app.post("/api/intake/recording", upload.single("audio"), async (req, res) => {
  const file = req.file;

  if (!file) return res.status(400).json({ error: "audio file missing" });

  const ext = path.extname(file.originalname) || ".wav";
  const newPath = file.path + ext;
  await fs.promises.rename(file.path, newPath);

  // Use extractFromVoice to process the uploaded audio file
  try {
    const result = await extractFromVoice(newPath);
    return res.json({ result });
  } catch (error) {
    console.error("Error extracting from voice:", error);
    return res.status(500).json({ error: "Failed to extract from voice" });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/api/live" });

wss.on("connection", async (ws) => {
  let live: LiveConn | null = null;
  let sessionId = "";

  ws.on("message", async (raw, isBinary) => {
    if (isBinary) {
      live?.sendAudio(Buffer.from(raw as Buffer));
      return;
    }
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "bootstrap") {
      sessionId = msg.sessionId || crypto.randomUUID();

      const extraction = msg.extraction as Extraction;
      sessionStore.set(sessionId, extraction);

      const top5 = pickTop5Unanswered(extraction.unanswered);
      console.log("Top 5 questions prepared:", JSON.stringify(top5, null, 2));

      try {
        live = await connectToGeminiLive({
          systemPrompt: PROMPT,
          questions: top5,
          confidenceThreshold: msg.confidenceThreshold || 0.8,
        });

        live.onEvent(async (evt: any) => {
          console.log("Live event received:", JSON.stringify(evt, null, 2));

          if (evt.type === "tool_call" && evt.name === "updateAnswer") {
            // persist and ack
            const current = sessionStore.get(sessionId)!;
            const updated = applyAnswerUpdate(current, evt.args);
            sessionStore.set(sessionId, updated);

            const response = { type: "answer_updated", answer: evt.args };
            console.log(
              "Sending answer update:",
              JSON.stringify(response, null, 2)
            );
            ws.send(JSON.stringify(response));

            live?.sendControl({
              type: "tool_result",
              name: "updateAnswer",
              requestId: evt.requestId,
              output: { ok: true },
            });
            return;
          }

          // Handle session end events that might be causing early closure
          if (evt.type === "done" || evt.type === "error") {
            console.log("Session ending event:", evt);
          }

          console.log(
            "Forwarding event to frontend:",
            JSON.stringify(evt, null, 2)
          );
          ws.send(JSON.stringify(evt));
        });
        ws.send(
          JSON.stringify({
            type: "ready",
            questions: top5.map((q: any) => ({
              id: q.id,
              question_text: q.question_text,
            })),
          })
        );
      } catch (e: any) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: e?.message || "live init failed",
          })
        );
        ws.close();
      }
    }

    if (msg.type === "stop") {
      live?.close();
      ws.close();
    }
  });

  ws.on("close", () => {
    live?.close();
  });
});

const PORT = Number(process.env.PORT || 8585);
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
server.listen(PORT + 1, () => console.log(`Server listening on :${PORT + 1}`));
