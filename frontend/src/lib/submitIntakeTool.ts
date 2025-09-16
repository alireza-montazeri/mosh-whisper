// Function calling schema for Live API
export const submitIntakeTool = {
  name: "submit_intake",
  description: "Finalize structured intake answers for the GP.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["hair", "skin", "weight", "sexual_health", "mental_health"],
      },
      answers: {
        type: "object",
        properties: {
          duration_months: { type: "integer", minimum: 0 },
          pattern: { type: "string" },
          symptoms: { type: "array", items: { type: "string" } },
          treatments_tried: { type: "array", items: { type: "string" } },
          medications: { type: "array", items: { type: "string" } },
          allergies: { type: "array", items: { type: "string" } },
          photos_attached: { type: "boolean" },
        },
        required: ["medications", "allergies"],
      },
      unknowns: { type: "array", items: { type: "string" } },
      red_flags: { type: "array", items: { type: "string" } },
    },
    required: ["category", "answers"],
  },
};
