import { transcribeAudioFile } from "./transcribe";
import { extractFromTranscript } from "./extract";
import { writeFile } from "fs/promises";
import { mkdir } from "fs/promises";

export async function extractFromVoice(filePath: string) {
  const timestamp = Date.now();
  // 1) transcribe
  const transcript = await transcribeAudioFile(filePath);
  if (!transcript) throw new Error("transcription failed");
  await mkdir("tmp/transcription", { recursive: true });
  await writeFile(
    `tmp/transcription/transcription-${timestamp}.txt`,
    transcript
  );
  console.log("Finished transcription!");

  // 2) extract
  const parsed = await extractFromTranscript(transcript);
  await mkdir("tmp/extraction", { recursive: true });
  await writeFile(
    `tmp/extraction/extraction-${timestamp}.json`,
    JSON.stringify(parsed, null, 2)
  );
  console.log("Finished extraction!");

  return parsed;
}
