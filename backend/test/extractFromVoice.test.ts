import { extractFromVoice } from "../src/llm/extractFromVoice";
import { writeFileSync } from "fs";

extractFromVoice("./test/08a58cc0-fd70-408f-b122-6f43ac763899.mp3").then(
  (r) => {
    writeFileSync("./test/extracted.json", JSON.stringify(r, null, 2));
  }
);
