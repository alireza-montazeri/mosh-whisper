import { GoogleGenAI } from "@google/genai";
import { responseSchema } from "./schema";
import { SILENT_EXTRACTOR_SYSTEM } from "./extractorPrompt";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function extractFromTranscript(
  transcript: string,
  quizSpec: any[]
) {
  const model = ai.models.generateContent({ model: "gemini-2.0-flash-001" });

  const result = await model.generateContent({
    generationConfig: { responseMimeType: "application/json", responseSchema },
    contents: [
      { role: "user", parts: [{ text: SILENT_EXTRACTOR_SYSTEM }] },
      {
        role: "user",
        parts: [{ text: "quiz_spec:\n" + JSON.stringify(quizSpec) }],
      },
      { role: "user", parts: [{ text: "transcript:\n" + transcript }] },
    ],
  });

  const text = result.response.text();
  let parsed: any = { answers: [], derived: {}, unanswered: [], warnings: [] };
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed.warnings.push("Invalid JSON from model");
  }

  // Compute BMI if missing
  const h = firstNum(parsed, ["initial_height"]);
  const w = firstNum(parsed, ["initial_moshy_weight"]);
  const heightCm = h?.unit === "cm" || !h?.unit ? h?.number : undefined;
  const weightKg = w?.unit === "kg" || !w?.unit ? w?.number : undefined;
  const bmi =
    heightCm && weightKg
      ? +(weightKg / Math.pow(heightCm / 100, 2)).toFixed(1)
      : undefined;
  parsed.derived = {
    ...(parsed.derived ?? {}),
    height_cm: heightCm ?? null,
    weight_kg: weightKg ?? null,
    bmi: bmi ?? null,
  };

  // fill unanswered
  const allIds = new Set<number>(quizSpec.map((q) => q.id));
  const answeredIds = new Set<number>(
    (parsed.answers ?? []).map((a: any) => a.question_id)
  );
  parsed.unanswered = Array.from(allIds).filter((id) => !answeredIds.has(id));

  return parsed;
}

function firstNum(parsed: any, stamps: string[]) {
  return parsed.answers?.find(
    (a: any) => stamps.includes(a.frontend_stamp) && a.number != null
  );
}
