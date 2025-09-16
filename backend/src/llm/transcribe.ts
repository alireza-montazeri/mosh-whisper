import {
  createPartFromUri,
  createUserContent,
  GoogleGenAI,
} from "@google/genai";
import path from "path";

import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function transcribeAudioFile(absPath: string, mimeType?: string) {
  // Try to infer basic mime
  const mt = mimeType || guessMime(absPath);

  // Upload the file once, reference by URI
  const file = await ai.files.upload({
    file: absPath,
    config: { mimeType: mt },
  });

  if (!file?.uri) throw new Error("File upload failed");
  if (!file?.mimeType) throw new Error("File mime missing name");
  if (!file?.name) throw new Error("File name missing");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(file.uri, file.mimeType),
      "Transcribe this audio verbatim in English. Output only the transcript text.",
    ]),
  });

  // Clean up temp file
  try {
    await ai.files.delete({ name: file.name });
  } catch {}

  return response.text;
}

function guessMime(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}
