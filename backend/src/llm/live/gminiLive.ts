import { GoogleGenAI, Modality, Type } from "@google/genai";

// Reuse your instantiated client, or create a new one here:
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY environment variable is not set!");
  throw new Error("GEMINI_API_KEY is required");
}

const ai = new GoogleGenAI({ apiKey });

/* -------------------------------------------
 * GEMINI LIVE CONNECTION (real)
 * Emits:
 *  - {type:"agent_says", text}
 *  - {type:"partial_transcript", text}
 *  - {type:"tool_call", name:"updateAnswer", args:{...}, requestId?: string}
 *  - {type:"done"}
 *  - {type:"error", error}
 * You can optionally send a tool result back by calling:
 *   sendControl({ type: "tool_result", name, requestId, output })
 * -----------------------------------------*/
type LiveConn = {
  sendAudio: (buf: ArrayBuffer | Buffer) => void;
  sendControl: (msg: any) => void;
  close: () => void;
  onEvent: (cb: (e: any) => void) => void;
};

function buildInstructions(confidenceThreshold: number) {
  // The agent must not be silent; it should open with the thank-you line,
  // ask one question at a time, and call updateAnswer once it's confident.
  return `
You are a friendly and empathetic clinical intake assistant with expertise in conducting follow-up interviews.

Your role:
- Start by saying: "Thanks for sharing your summary. I have a few follow-up questions to complete your file."
- Ask one provided question at a time (in order).
- Use active listening and show empathy in your responses.
- Ask thoughtful clarifying questions to gather complete and accurate information.
- When you reach high confidence (≥ CONFIDENCE_THRESHOLD), call the updateAnswer tool immediately.

Question-asking strategies:
- Begin with open-ended questions: "Can you tell me about...?" or "What can you share about...?"
- For unclear responses: "Could you clarify what you mean by...?" or "Can you help me understand...?"
- For incomplete answers: "Is there anything else you'd like to add about...?" or "Are there any other details...?"
- Always acknowledge the user's response before asking follow-up questions.

Tool usage:
- Call updateAnswer with: {question_id, question_text, question_frontend_stamp, answer_id?, answer_text?, answer_frontend_stamp?, type, confidence, evidence}
- Evidence should be a direct quote or summary from the user's response.
- After calling updateAnswer, immediately move to the next question.
- When all questions are complete, say "Thank you! I have all the information I need."

Communication style:
- Be conversational and natural, not robotic.
- Show empathy and understanding.
- Keep responses concise but warm.
- Avoid medical jargon unless necessary.

Conversation rules:
- Start immediately by saying: "Thanks for sharing your summary. I have a few follow-up questions to complete your file."
- Ask one follow-up question at a time from the list I provide (in order).
- After each user reply, you may ask 1-2 brief clarifying questions if needed to increase confidence.
- When your confidence for the current question is >= ${confidenceThreshold}, call the "updateAnswer" tool immediately with the structured data.
- Tool call parameters: { question_id, question_text, question_frontend_stamp, type, answer_id (if single choice), answer_text, answer_frontend_stamp, confidence, evidence }
- Evidence should be a short quote or summary from what the user said.
- Keep responses conversational, empathetic, and natural.
- After calling updateAnswer for a question, move to the next question immediately.
- If all questions are answered, say "Thank you! I have all the information I need."

Follow-up question strategies:
- Ask open-ended questions first: "Can you tell me about...?"
- For unclear responses, ask: "Could you clarify..." or "What do you mean by...?"
- For incomplete answers: "Is there anything else you'd like to add about...?"
- Always acknowledge the user's response before asking clarifying questions.
`;
}

function buildQuestionsTurn(
  questions: {
    id: number;
    question_text: string;
    frontend_stamp: string;
    question_type: string;
    answer_list: { id: number; answer_text: string; frontend_stamp: string }[];
  }[]
) {
  // Pass the shortlist to the model as context so it knows the exact wording & stamps
  const payload = {
    unanswered_followups: questions.map((q) => ({
      question_id: q.id,
      question_text: q.question_text,
      question_frontend_stamp: q.frontend_stamp,
      question_type: q.question_type,
      answers:
        q.answer_list?.map((a) => ({
          answer_id: a.id,
          answer_text: a.answer_text,
          answer_frontend_stamp: a.frontend_stamp,
        })) ?? [],
    })),
  };

  return {
    role: "user",
    parts: [
      {
        text: "FOLLOW-UP QUESTIONS JSON:\n" + JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export async function connectToGeminiLive(opts: {
  systemPrompt: string;
  questions: {
    id: number;
    question_text: string;
    frontend_stamp: string;
    question_type: string;
    answer_list: { id: number; answer_text: string; frontend_stamp: string }[];
  }[];
  confidenceThreshold: number;
}): Promise<LiveConn> {
  const listeners: Array<(e: any) => void> = [];
  const emit = (e: any) => listeners.forEach((l) => l(e));

  // Declare the function the agent can call when it’s confident.

  const updateAnswerTool = {
    name: "updateAnswer",
    description:
      "Update the structured extraction output with a newly confirmed answer for a specific question.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        question_id: { type: Type.INTEGER },
        question_text: { type: Type.STRING },
        question_frontend_stamp: { type: Type.STRING },
        type: { type: Type.STRING },
        answer_id: { type: Type.INTEGER, nullable: true },
        answer_text: { type: Type.STRING, nullable: true },
        answer_frontend_stamp: { type: Type.STRING, nullable: true },
        confidence: { type: Type.NUMBER },
        evidence: { type: Type.STRING },
      },
      required: [
        "question_id",
        "question_text",
        "question_frontend_stamp",
        "type",
        "confidence",
        "evidence",
      ],
      additionalProperties: false,
    },
  };

  // Open the Live connection.
  // NOTE: Live currently targets the realtime-capable model family.
  // "gemini-2.0-flash-exp" (or newer live-enabled models) is recommended.
  const session = await ai.live.connect({
    model: "gemini-2.0-flash-exp",
    config: {
      // Make the agent follow our behavior.
      systemInstruction: buildInstructions(opts.confidenceThreshold),

      // We want text back (frontend will handle TTS).
      responseModalities: [Modality.TEXT],

      // Transcribe user mic input automatically so we get partials via callback.
      inputAudioTranscription: {
        // If available in your region; otherwise omit and do your own ASR.
        // You can also add language hints, e.g., languageCodes: ["en"],
        model: "gemini-2.0-flash-transcribe",
      },

      // Enable function calling.
      tools: [{ functionDeclarations: [updateAnswerTool] }],
    },

    // Streamed callbacks
    callbacks: {
      onmessage: (msg: any) => {
        try {
          console.log(
            "Gemini Live message received:",
            JSON.stringify(msg, null, 2)
          );

          if (msg.text) {
            emit({ type: "agent_says", text: msg.text });
          }
          if (msg.serverContent?.inputTranscription?.text) {
            emit({
              type: "partial_transcript",
              text: msg.serverContent.inputTranscription.text,
            });
          }
          if (msg.toolCall?.functionCalls) {
            for (const call of msg.toolCall.functionCalls) {
              if (call.name === "updateAnswer" && call.args) {
                emit({
                  type: "tool_call",
                  name: call.name,
                  args: call.args,
                  requestId: call.id,
                });
              }
            }
          }
        } catch (error) {
          console.error("Error processing Gemini Live message:", error);
          emit({ type: "error", error: String(error) });
        }
      },
      // Lifecycle
      onopen: async () => {
        console.log("Gemini Live session opened");
        try {
          // Kick off the first turn so the agent starts speaking right away.
          const questionsTurn = buildQuestionsTurn(opts.questions);
          console.log(
            "Sending questions turn:",
            JSON.stringify(questionsTurn, null, 2)
          );

          session.sendClientContent({
            turns: [questionsTurn],
            turnComplete: true,
          });
        } catch (error) {
          console.error("Error in onopen:", error);
          emit({ type: "error", error: String(error) });
        }
      },
      onclose: () => {
        console.log("Gemini Live session closed");
        emit({ type: "done" });
      },
      onerror: (err: any) => {
        console.error("Gemini Live session error:", err);
        emit({ type: "error", error: err?.message ?? String(err) });
      },
    },
  });

  return {
    // Send raw PCM16 mono @16kHz chunks from the browser (after stripping WAV headers if present).
    sendAudio: (buf: ArrayBuffer | Buffer) => {
      try {
        const u8 = Buffer.isBuffer(buf)
          ? new Uint8Array(buf)
          : new Uint8Array(buf);
        const b64 =
          typeof window === "undefined"
            ? Buffer.from(u8).toString("base64")
            : btoa(String.fromCharCode(...u8));
        session.sendRealtimeInput({
          // The mimeType must match inputAudioFormat above.
          audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
        });
      } catch (err: any) {
        emit({ type: "error", error: err?.message ?? String(err) });
      }
    },

    // Utility control messages:
    //  - { type: "turn_complete" } → lets model respond now
    //  - { type: "text", text: "..." } → add extra context mid-session
    //  - { type: "tool_result", name, requestId, output } → ACK a tool call
    sendControl: (msg: any) => {
      if (!msg) return;
      if (msg.type === "turn_complete") {
        session.sendClientContent({ turnComplete: true });
      } else if (msg.type === "text" && typeof msg.text === "string") {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: msg.text }] }],
        });
      } else if (
        msg.type === "tool_result" &&
        msg.name &&
        msg.requestId &&
        msg.output
      ) {
        // Use the dedicated helper for tool responses
        session.sendToolResponse({
          functionResponses: [
            {
              name: msg.name,
              id: msg.requestId,
              response: msg.output,
            },
          ],
        });
      }
    },

    close: () => {
      try {
        session.close();
      } catch {
        /* noop */
      }
    },

    onEvent: (cb) => listeners.push(cb),
  };
}
