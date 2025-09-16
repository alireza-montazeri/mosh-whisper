import { Type } from "@google/genai";

export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question_id: { type: Type.INTEGER },
          frontend_stamp: { type: Type.STRING },
          type: { type: Type.STRING }, // matches question_type
          // one of the following depending on type:
          answer_id: { type: Type.INTEGER, nullable: true },
          answer_ids: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            nullable: true,
          },
          free_text: { type: Type.STRING, nullable: true },
          number: { type: Type.NUMBER, nullable: true },
          unit: { type: Type.STRING, nullable: true },
          date: { type: Type.STRING, nullable: true },
          phone: { type: Type.STRING, nullable: true },
          email: { type: Type.STRING, nullable: true },
          first_name: { type: Type.STRING, nullable: true },
          last_name: { type: Type.STRING, nullable: true },
          suburb: { type: Type.STRING, nullable: true },
          state: { type: Type.STRING, nullable: true },
          postcode: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
          evidence: { type: Type.STRING },
        },
        required: [
          "question_id",
          "frontend_stamp",
          "type",
          "confidence",
          "evidence",
        ],
      },
    },
    derived: {
      type: Type.OBJECT,
      properties: {
        height_cm: { type: Type.NUMBER, nullable: true },
        weight_kg: { type: Type.NUMBER, nullable: true },
        bmi: { type: Type.NUMBER, nullable: true },
      },
    },
    unanswered: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["answers", "derived", "unanswered", "warnings"],
} as const;
