import { Type } from "@google/genai";

export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          // Question fields
          question_id: { type: Type.INTEGER },
          question_text: { type: Type.STRING, nullable: true },
          question_frontend_stamp: { type: Type.STRING, nullable: true },

          // Answer fields
          answer_id: { type: Type.INTEGER, nullable: true },
          answer_text: { type: Type.STRING, nullable: true },
          answer_frontend_stamp: { type: Type.STRING, nullable: true },

          // Meta
          type: { type: Type.STRING, nullable: true }, // matches question_type
          confidence: { type: Type.NUMBER },
          evidence: { type: Type.STRING },
        },
        required: ["question_id", "type", "confidence", "evidence"],
        additionalProperties: false,
      },
    },

    // keep derived minimal; allow nulls
    derived: {
      type: Type.OBJECT,
      properties: {
        height_cm: { type: Type.NUMBER, nullable: true },
        weight_kg: { type: Type.NUMBER, nullable: true },
        bmi: { type: Type.NUMBER, nullable: true },
      },
      additionalProperties: true,
    },

    // unanswered entries with corrected types
    unanswered: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question_id: { type: Type.INTEGER },
          question_text: { type: Type.STRING, nullable: true },
          question_frontend_stamp: { type: Type.STRING, nullable: true },
        },
        required: ["question_id"],
        additionalProperties: false,
      },
    },

    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["answers", "derived", "unanswered", "warnings"],
} as const;
