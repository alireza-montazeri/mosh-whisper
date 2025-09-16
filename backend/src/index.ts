import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { transcribeAudioFile } from "./llm/transcribe";
import { extractFromTranscript } from "./llm/extract";

import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

// Multer storage to /tmp
const upload = multer({ dest: path.join(process.cwd(), "tmp") });

// POST /api/intake/recording
// form-data: audio=<file>, quizSpec=<json string>
app.post("/api/intake/recording", upload.single("audio"), async (req, res) => {
  const file = req.file;
  const rawQuiz = req.body.quizSpec;

  if (!file) return res.status(400).json({ error: "audio file missing" });
  if (!rawQuiz) return res.status(400).json({ error: "quizSpec missing" });

  let quizSpec: any[];
  try {
    quizSpec = JSON.parse(rawQuiz);
  } catch {
    return res.status(400).json({ error: "quizSpec must be JSON" });
  }

  try {
    // 1) transcribe
    const transcript = await transcribeAudioFile(file.path);

    // 2) extract
    const parsed = await extractFromTranscript(transcript, quizSpec);

    // 3) respond
    res.json({ transcript, parsed });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "processing failed" });
  } finally {
    // cleanup
    if (file?.path)
      try {
        await fs.unlink(file.path);
      } catch {}
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
