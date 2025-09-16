import { transcribeAudioFile } from "../src/llm/transcribe";

transcribeAudioFile(
  "/Users/alireza/Documents/mosh-whisper/backend/test/Cooper St.m4a"
).then((res) => {
  console.log(res);
});
