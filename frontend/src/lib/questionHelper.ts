// Frontend helper functions for question prioritization

type UnansweredQuestion = {
  question_id: number;
  question_text?: string | null;
  question_frontend_stamp?: string | null;
};

type QuestionWithMetadata = {
  id: number;
  question_text: string;
  question_frontend_stamp: string;
  question_type: string;
  answer_list?: {
    id: number;
    answer_text: string;
    answer_frontend_stamp: string;
  }[];
};

// Simplified weight mapping for prioritizing questions
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

// Simplified question metadata (you can expand this based on your needs)
const QUESTION_METADATA: Record<number, QuestionWithMetadata> = {
  1277: {
    id: 1277,
    question_text: "My height is _ centimetres",
    question_frontend_stamp: "initial_height",
    question_type: "number_input",
  },
  1278: {
    id: 1278,
    question_text: "My weight is _ kilograms",
    question_frontend_stamp: "initial_moshy_weight",
    question_type: "number_input",
  },
  1308: {
    id: 1308,
    question_text: "Have you ever had diabetes?",
    question_frontend_stamp: "initial_weight_diabetes",
    question_type: "single_choice",
    answer_list: [
      { id: 1, answer_text: "Yes", answer_frontend_stamp: "yes" },
      { id: 2, answer_text: "No", answer_frontend_stamp: "no" },
    ],
  },
  1309: {
    id: 1309,
    question_text: "Is there history of diabetes in your family?",
    question_frontend_stamp: "initial_weight_diabetes_history",
    question_type: "single_choice",
    answer_list: [
      { id: 1, answer_text: "Yes", answer_frontend_stamp: "yes" },
      { id: 2, answer_text: "No", answer_frontend_stamp: "no" },
    ],
  },
  1299: {
    id: 1299,
    question_text: "Have you ever had any issues with the following?",
    question_frontend_stamp: "initial_weight_issues_following",
    question_type: "multiple_choice",
  },
  1317: {
    id: 1317,
    question_text: "Are you currently taking medications or supplements?",
    question_frontend_stamp: "initial_medications",
    question_type: "single_choice",
    answer_list: [
      { id: 1, answer_text: "Yes", answer_frontend_stamp: "yes" },
      { id: 2, answer_text: "No", answer_frontend_stamp: "no" },
    ],
  },
  1319: {
    id: 1319,
    question_text: "Do you have any allergies?",
    question_frontend_stamp: "initial_allergies",
    question_type: "single_choice",
    answer_list: [
      { id: 1, answer_text: "Yes", answer_frontend_stamp: "yes" },
      { id: 2, answer_text: "No", answer_frontend_stamp: "no" },
    ],
  },
};

export function pickTop5Unanswered(
  unanswered: UnansweredQuestion[]
): QuestionWithMetadata[] {
  return unanswered
    .map((u) => {
      const metadata = QUESTION_METADATA[u.question_id];
      if (!metadata) {
        // Fallback for questions not in our metadata
        return {
          weight: STAMP_WEIGHT["*"],
          question: {
            id: u.question_id,
            question_text: u.question_text || `Question ${u.question_id}`,
            question_frontend_stamp: u.question_frontend_stamp || "",
            question_type: "text_input",
          },
        };
      }

      const stamp =
        u.question_frontend_stamp || metadata.question_frontend_stamp || "";
      const weight = STAMP_WEIGHT[stamp] ?? STAMP_WEIGHT["*"];
      return { weight, question: metadata };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(({ question }) => question);
}

export { type QuestionWithMetadata };
