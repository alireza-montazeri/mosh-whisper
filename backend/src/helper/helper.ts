import { BlueprintQuestion, Extraction } from "../llm/types";
import { wlQuizObject } from "../quiz/wlQuizObject";
import { buildBlueprint } from "../utils/buildBlueprint";

// Apply an answer update to the current extraction state
export function applyAnswerUpdate(
  current: Extraction,
  answerData: any
): Extraction {
  // Simple implementation - in real app this would be more sophisticated
  return {
    ...current,
    answers: [...current.answers, answerData],
    unanswered: current.unanswered.filter(
      (u) => u.question_id !== answerData.question_id
    ),
  };
}

const STAMP_WEIGHT: Record<string, number> = {
  initial_height: 100,
  initial_moshy_weight: 100,
  initial_dob: 95,
  initial_sex: 90,
  initial_weight_diabetes: 80,
  initial_weight_diabetes_history: 75,
  initial_weight_more_issues_following: 68,
  initial_medications: 65,
  "*": 50,
};

export function pickTop5Unanswered(unanswered: Extraction["unanswered"]) {
  const quizSpec: BlueprintQuestion[] = buildBlueprint(wlQuizObject);
  const byId = new Map<number, BlueprintQuestion>(
    (quizSpec as BlueprintQuestion[]).map((q) => [q.id, q])
  );
  return unanswered
    .map((u) => {
      const q = byId.get(u.question_id);
      if (!q) return null;
      const stamp =
        u.question_frontend_stamp ?? q.question_frontend_stamp ?? "";
      const weight = STAMP_WEIGHT[stamp] ?? STAMP_WEIGHT["*"];
      return { weight, q };
    })
    .filter((x): x is { weight: number; q: BlueprintQuestion } => x !== null)
    .sort((a, b) => b?.weight - a.weight)
    .slice(0, 5)
    .map(({ q }) => ({
      id: q.id,
      question_text: q.question_text,
      frontend_stamp: q.question_frontend_stamp,
      question_type: q.question_type,
      answer_list:
        q.answer_list?.map((a) => ({
          id: a.id,
          answer_text: a.answer_text,
          frontend_stamp: a.answer_frontend_stamp,
        })) ?? [],
    }));
}
