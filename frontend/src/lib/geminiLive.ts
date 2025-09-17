import { GoogleGenAI, Modality, Type } from "@google/genai";

// Frontend Gemini Live implementation
type LiveEvent = {
  type: "agent_says" | "partial_transcript" | "tool_call" | "done" | "error";
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  requestId?: string;
  error?: string;
};

type ControlMessage = {
  type: "turn_complete" | "text" | "tool_result";
  text?: string;
  name?: string;
  requestId?: string;
  output?: Record<string, unknown>;
};

type LiveConn = {
  sendAudio: (buf: ArrayBuffer) => void;
  sendControl: (msg: ControlMessage) => void;
  startInterview: () => void;
  close: () => void;
  onEvent: (cb: (e: LiveEvent) => void) => void;
};

type Question = {
  id: number;
  question_text: string;
  question_frontend_stamp?: string;
  question_type: string;
  answer_list?: {
    id: number;
    answer_text: string;
    answer_frontend_stamp: string;
  }[];
};

function buildInstructions(_confidenceThreshold: number) {
  return `
You are a helpful assistant. When you receive questions, say "Hello! I received your questions and I'm ready to help." Then start asking the questions one by one.
`;
}

function buildQuestionsTurn(questions: Question[]) {
  const questionList = questions
    .map((q, index) => `${index + 1}. ${q.question_text}`)
    .join("\n");

  return {
    role: "user" as const,
    parts: [
      {
        text: `Here are the follow-up questions to ask one by one:

${questionList}

Instructions:
1. Ask each question conversationally and wait for my response
2. When you receive a clear answer, use the updateAnswer tool to record it
3. After recording the answer, continue to the next question
4. Be empathetic and natural in your conversation

Please start the interview now by greeting me and asking the first question.`,
      },
    ],
  };
}

export async function connectToGeminiLive(opts: {
  apiKey: string;
  questions: Question[];
  confidenceThreshold: number;
}): Promise<LiveConn> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const listeners: Array<(e: LiveEvent) => void> = [];
  const emit = (e: LiveEvent) => listeners.forEach((l) => l(e));
  let sessionStarted = false;

  console.log("Connecting to Gemini Live with questions:", opts.questions);
  console.log("API Key starts with:", opts.apiKey.substring(0, 10) + "...");

  // Declare the function the agent can call when it's confident.
  const updateAnswerTool = {
    name: "updateAnswer",
    description:
      "REQUIRED: Call this for every answer received. Record the user's response to a question.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        question_id: {
          type: Type.INTEGER,
          description: "The question ID number",
        },
        question_text: {
          type: Type.STRING,
          description: "The exact question text",
        },
        question_frontend_stamp: {
          type: Type.STRING,
          description: "Question type or timestamp",
        },
        type: { type: Type.STRING, description: "Answer type, usually 'text'" },
        answer_text: {
          type: Type.STRING,
          description: "The user's actual response",
        },
        confidence: {
          type: Type.NUMBER,
          description: "Confidence level 0.1-1.0",
        },
        evidence: {
          type: Type.STRING,
          description: "Why this answer was recorded",
        },
      },
      required: ["question_id", "question_text", "answer_text", "confidence"],
      additionalProperties: false,
    },
  };

  const session = await ai.live.connect({
    model: "gemini-2.0-flash-exp",
    config: {
      systemInstruction:
        "You are a helpful medical interview assistant. Ask questions one by one and listen carefully to answers. When you receive a clear answer to a question, use the updateAnswer tool to record it with the question details and the user's response. Always wait for the user to respond before continuing. Be conversational and empathetic.",
      generationConfig: {
        responseModalities: [Modality.TEXT],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
      tools: [
        {
          functionDeclarations: [updateAnswerTool],
        },
      ],
    },

    callbacks: {
      onmessage: (msg) => {
        try {
          console.log(
            "🔄 Gemini Live message received:",
            JSON.stringify(msg, null, 2)
          );

          // Handle text output (for display)
          if (msg.text && typeof msg.text === "string") {
            console.log("📝 Agent text response:", msg.text);
            emit({ type: "agent_says", text: msg.text });
          }

          // Check for server content
          if (msg.serverContent) {
            console.log(
              "🖥️ Server content:",
              JSON.stringify(msg.serverContent, null, 2)
            );

            // Handle transcription
            if (msg.serverContent.inputTranscription?.text) {
              console.log(
                "🎤 Transcription:",
                msg.serverContent.inputTranscription.text
              );
              emit({
                type: "partial_transcript",
                text: msg.serverContent.inputTranscription.text,
              });
            }
          }

          // Handle tool calls
          if (msg.toolCall?.functionCalls) {
            console.log("🔧 Tool calls received:", msg.toolCall.functionCalls);
            for (const call of msg.toolCall.functionCalls) {
              console.log(
                "🔧 Processing function call:",
                call.name,
                "with args:",
                call.args
              );
              if (call.name === "updateAnswer" && call.args) {
                console.log("✅ updateAnswer tool call detected");
                emit({
                  type: "tool_call",
                  name: "updateAnswer",
                  args: call.args as Record<string, unknown>,
                  requestId: call.id,
                });
              } else {
                console.log("❌ Unknown or invalid tool call:", call.name);
              }
            }
          }

          // Check for any unknown message types
          if (!msg.text && !msg.serverContent && !msg.toolCall) {
            console.log("❓ Unknown message type received:", Object.keys(msg));
          }
        } catch (error) {
          console.error("💥 Error processing Gemini Live message:", error);
          emit({ type: "error", error: String(error) });
        }
      },

      onopen: async () => {
        console.log("🟢 Gemini Live session opened successfully");
        sessionStarted = true;

        // Don't send anything immediately - wait for the UI to be ready
        console.log("✅ Session ready, waiting for questions to be sent...");
      },

      onclose: (event) => {
        console.log("🔴 Gemini Live session closed");
        console.log("🔍 Close event details:", event);
        console.log("🔍 Session was started:", sessionStarted);
        console.log("🔍 Event code:", event?.code);
        console.log("🔍 Event reason:", event?.reason);

        if (!sessionStarted) {
          console.log("❌ Session closed before starting - API issue");
          emit({
            type: "error",
            error:
              "Session closed before starting - check API key or model availability",
          });
        } else {
          console.log("✅ Normal session closure");
          emit({ type: "done" });
        }
      },

      onerror: (err) => {
        console.error("💥 Gemini Live session error:", err);
        console.log("🔍 Error object keys:", Object.keys(err || {}));
        console.log("🔍 Error toString:", String(err));
        emit({ type: "error", error: String(err) });
      },
    },
  });

  return {
    sendAudio: (buf: ArrayBuffer) => {
      console.log("🎵 Audio received - buffer length:", buf.byteLength);

      try {
        // Let's see what methods are actually available on the session
        console.log("🔍 Session methods:", Object.getOwnPropertyNames(session));
        console.log(
          "🔍 Session prototype:",
          Object.getOwnPropertyNames(Object.getPrototypeOf(session))
        );

        // Try sending audio in a simple format first
        const u8 = new Uint8Array(buf);
        const b64 = btoa(String.fromCharCode(...u8));

        // Let's try the method that might exist - check what sendRealtimeInput actually expects
        console.log("🎵 Attempting to send audio...");

        // Try basic audio sending with PCM format
        try {
          session.sendRealtimeInput({
            audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
          });
          console.log("✅ Audio sent with PCM format");
        } catch (audioErr) {
          console.log("❌ PCM format failed:", audioErr);

          // Try basic PCM without rate
          try {
            session.sendRealtimeInput({
              audio: { data: b64, mimeType: "audio/pcm" },
            });
            console.log("✅ Audio sent with basic PCM format");
          } catch (pcmErr) {
            console.log("❌ Basic PCM failed:", pcmErr);
            throw pcmErr;
          }
        }
      } catch (err) {
        console.error("� All audio sending methods failed:", err);
        emit({
          type: "error",
          error: `Audio sending failed: ${err}`,
        });
      }
    },

    sendControl: (msg: ControlMessage) => {
      if (!msg) return;
      console.log("📤 Sending control message:", msg);

      if (msg.type === "turn_complete") {
        session.sendClientContent({ turnComplete: true });
      } else if (msg.type === "text" && typeof msg.text === "string") {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
      } else if (
        msg.type === "tool_result" &&
        msg.name &&
        msg.requestId &&
        msg.output
      ) {
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

    // Add a method to start the interview
    startInterview: () => {
      console.log("🎯 Starting interview with questions:", opts.questions);
      const questionsTurn = buildQuestionsTurn(opts.questions);
      session.sendClientContent({
        turns: [questionsTurn],
        turnComplete: true,
      });
    },

    close: () => {
      try {
        console.log("🔴 Closing Gemini Live session");
        session.close();
      } catch {
        /* noop */
      }
    },

    onEvent: (cb) => listeners.push(cb),
  };
}
