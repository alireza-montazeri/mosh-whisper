// types/blueprint.ts
export type BlueprintAnswer = {
  id: number;
  answer_text: string;
  answer_frontend_stamp: string;
};

export type BlueprintQuestion = {
  id: number;
  question_text: string;
  question_type: string;
  question_frontend_stamp: string;
  answer_list: BlueprintAnswer[];
};

export type ExtractionBlueprint = BlueprintQuestion[];

export type Extraction = {
  answers: any[];
  unanswered: Array<{
    question_id: number;
    question_text?: string;
    question_frontend_stamp?: string;
  }>;
  derived: Record<string, unknown>;
  warnings: string[];
};
