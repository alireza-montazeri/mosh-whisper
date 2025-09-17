import { GoogleGenAI } from "@google/genai";
import { responseSchema } from "./schema";
import { SILENT_EXTRACTOR_SYSTEM } from "./extractorPrompt";
import type { BlueprintQuestion } from "./types";
import { buildBlueprint } from "../utils/buildBlueprint";
import { wlQuizObject } from "../quiz/wlQuizObject";

import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/**
 * Extracts structured answers from a transcript using the slim blueprint:
 * - Only uses question_text, answer_text, and their IDs/stamps.
 * - Computes derived fields (height_cm, weight_kg, bmi) by parsing answer_text (or evidence).
 * - Marks unanswered questions as objects with id/text/stamp.
 */
export async function extractFromTranscript(transcript: string) {
  const quizSpec: BlueprintQuestion[] = buildBlueprint(wlQuizObject);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: { responseMimeType: "application/json", responseSchema },
    contents: [
      { role: "user", parts: [{ text: SILENT_EXTRACTOR_SYSTEM }] },
      {
        role: "user",
        parts: [{ text: "quiz_spec:\n" + JSON.stringify(quizSpec, null, 2) }],
      },
      { role: "user", parts: [{ text: "transcript:\n" + transcript }] },
    ],
  });

  const text =
    typeof (response as any)?.text === "string"
      ? (response as any).text
      : typeof (response as any)?.response?.text === "function"
      ? (response as any).response.text()
      : (response as any)?.response?.text?.();

  let parsed: any = {
    answers: [],
    derived: {},
    unanswered: [],
    warnings: [] as string[],
  };

  try {
    const maybe = typeof text === "string" ? text : String(text ?? "");
    parsed = JSON.parse(maybe);
    parsed.answers ??= [];
    parsed.derived ??= {};
    parsed.unanswered ??= [];
    parsed.warnings ??= [];
  } catch {
    parsed.warnings.push("Invalid JSON from model");
  }

  // ---- DERIVED FIELDS (height_cm, weight_kg, bmi) ----
  const heightCm = getNumericFromAnswer(parsed, quizSpec, (q) =>
    /height/i.test(q.question_text ?? "")
  );

  const weightKg = getNumericFromAnswer(parsed, quizSpec, (q) =>
    /weight/i.test(q.question_text ?? "")
  );

  const bmi =
    isFinite(heightCm as number) &&
    isFinite(weightKg as number) &&
    (heightCm as number) > 0
      ? +(Number(weightKg) / Math.pow(Number(heightCm) / 100, 2)).toFixed(1)
      : undefined;

  parsed.derived = {
    ...(parsed.derived ?? {}),
    height_cm: heightCm ?? null,
    weight_kg: weightKg ?? null,
    bmi: bmi ?? null,
  };

  // ---- UNANSWERED (objects, not just IDs) ----
  const answeredIds = new Set<number>(
    (parsed.answers ?? [])
      .map((a: any) => a?.question_id)
      .filter((id: any) => typeof id === "number")
  );

  parsed.unanswered = (quizSpec as BlueprintQuestion[])
    .filter((q) => !answeredIds.has(q.id))
    .map((q) => ({
      question_id: q.id,
      question_text: q.question_text ?? null,
      question_frontend_stamp: q.question_frontend_stamp ?? null,
    }));

  return parsed;
}

/**
 * Pulls the numeric value for a matched question from the model's output shape.
 * New schema notes:
 *  - We parse numbers from `answer_text` first.
 *  - Fallback: parse a number from `evidence`.
 */
function getNumericFromAnswer(
  parsed: any,
  quizSpec: BlueprintQuestion[],
  matcher: (q: BlueprintQuestion) => boolean
): number | undefined {
  const q = quizSpec.find(matcher);
  if (!q) return undefined;

  const ans = (parsed.answers ?? []).find((a: any) => a?.question_id === q.id);
  if (!ans) return undefined;

  // Prefer number in answer_text (e.g., "185" or "111")
  const fromAnswer = extractNumber(ans.answer_text);
  if (fromAnswer != null) return fromAnswer;

  // Fallback: parse a number from evidence snippet (if any)
  const fromEvidence = extractNumber(ans.evidence);
  if (fromEvidence != null) return fromEvidence;

  return undefined;
}

function extractNumber(s: unknown): number | undefined {
  if (typeof s !== "string") return undefined;
  // accommodate "185", "111.5", or with stray words
  const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = +m[0];
  return Number.isFinite(n) ? n : undefined;
}
