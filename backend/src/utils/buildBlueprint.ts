// utils/buildBlueprint.ts
import type { ExtractionBlueprint } from "../llm/types";

const norm = (s: unknown): string | null =>
  typeof s === "string" ? s.trim() || null : null;

/** Convert your raw quiz JSON (the big array you shared) to the slim blueprint */
export function buildBlueprint(raw: any[]): ExtractionBlueprint {
  return (raw ?? []).map((q) => ({
    id: q.id,
    question_text: q.question_text ?? "",
    question_type: q.question_type ?? "unknown",
    question_frontend_stamp: norm(q.frontend_stamp) ?? "",
    answer_list: (q.answer_list ?? []).map((a: any) => ({
      id: a.id,
      answer_text: a.answer_text ?? "",
      answer_frontend_stamp: norm(a.frontend_stamp) ?? "",
    })),
  }));
}
