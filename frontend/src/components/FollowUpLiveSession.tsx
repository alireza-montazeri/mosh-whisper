import { useEffect, useRef, useState } from "react";
import { connectToGeminiLive } from "../lib/geminiLive";
import {
  pickTop5Unanswered,
  type QuestionWithMetadata,
} from "../lib/questionHelper";

type Answer = {
  question_id: number;
  question_text: string | null;
  question_frontend_stamp: string | null;
  answer_id?: number | null;
  answer_text?: string | null;
  answer_frontend_stamp?: string | null;
  type: string;
  confidence: number;
  evidence: string;
};

type Extraction = {
  answers: Answer[];
  unanswered: Array<{
    question_id: number;
    question_text?: string | null;
    question_frontend_stamp?: string | null;
  }>;
  derived: Record<string, unknown>;
  warnings: string[];
};

type Props = {
  sessionId: string;
  extraction: Extraction;
  onUpdateExtraction: (next: Extraction) => void;
  apiKey: string;
  confidenceThreshold?: number;
  autoStopMs?: number;
};

export default function FollowUpLiveSession({
  sessionId,
  extraction,
  onUpdateExtraction,
  apiKey,
  confidenceThreshold = 0.7,
  autoStopMs = 5 * 60_000,
}: Props) {
  const liveConnRef = useRef<any>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopperRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<"idle" | "live" | "done" | "error">(
    "idle"
  );
  const [status, setStatus] = useState("Click to start live session");
  const [queue, setQueue] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [answeredCount, setAnsweredCount] = useState(0);
  const [questions, setQuestions] = useState<QuestionWithMetadata[]>([]);
  const speakingRef = useRef(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Add debug logging
  const addDebugLog = (message: string) => {
    console.log(`[DEBUG] ${message}`);
    setDebugLogs((logs) => [
      ...logs.slice(-9),
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  // Text-to-speech for agent responses
  useEffect(() => {
    if (speakingRef.current || queue.length === 0) return;

    const textToSpeak = queue[0];
    if (!textToSpeak) return;

    speakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      speakingRef.current = false;
      setQueue((q) => q.slice(1)); // Remove the spoken message
    };

    utterance.onerror = () => {
      speakingRef.current = false;
      setQueue((q) => q.slice(1)); // Remove the message even on error
    };

    speechSynthesis.speak(utterance);
  }, [queue]);

  function cleanup() {
    if (stopperRef.current) {
      clearTimeout(stopperRef.current);
      stopperRef.current = null;
    }
    if (recRef.current && recRef.current.state === "recording") {
      recRef.current.stop();
    }
    if (streamRef.current) {
      // Close audio context if it exists
      const stream = streamRef.current as any;
      if (stream.audioContext) {
        stream.audioContext.close();
      }
      if (stream.processor) {
        stream.processor.disconnect();
      }

      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (liveConnRef.current) {
      liveConnRef.current.close();
      liveConnRef.current = null;
    }
    // Stop any ongoing speech synthesis
    speechSynthesis.cancel();
    speakingRef.current = false;
  }

  function mergeAnswer(answer: Partial<Answer> & { question_id: number }) {
    console.log("📊 mergeAnswer called with:", answer);
    console.log("📊 Current extraction before merge:", extraction);

    const next: Extraction = {
      ...extraction,
      answers: (() => {
        const i = extraction.answers.findIndex(
          (a) => a.question_id === answer.question_id
        );
        if (i >= 0) {
          const copy = extraction.answers.slice();
          copy[i] = { ...copy[i], ...answer } as Answer;
          console.log("📊 Updated existing answer at index", i, copy[i]);
          return copy;
        }
        console.log("📊 Adding new answer:", answer);
        return [...extraction.answers, answer as Answer];
      })(),
      unanswered: extraction.unanswered.filter(
        (u) => u.question_id !== answer.question_id
      ),
    };

    console.log("📊 New extraction after merge:", next);
    onUpdateExtraction(next);
    addDebugLog(
      `Answer merged for question ${answer.question_id}: ${answer.answer_text}`
    );
  }

  async function start() {
    try {
      console.log("Starting live session...");
      console.log("API Key provided:", apiKey ? "Yes" : "No");
      console.log("API Key length:", apiKey?.length || 0);
      addDebugLog("Starting live session...");

      setStatus("Connecting to Gemini Live...");
      setPhase("live");

      const top5 = pickTop5Unanswered(extraction.unanswered);
      setQuestions(top5);
      console.log("Top 5 questions:", top5);
      addDebugLog(`Found ${top5.length} questions to ask`);

      const liveConn = await connectToGeminiLive({
        apiKey,
        questions: top5,
        confidenceThreshold,
      });
      liveConnRef.current = liveConn;
      addDebugLog("Connected to Gemini Live");
      addDebugLog(`API key first 10 chars: ${apiKey.substring(0, 10)}...`);

      liveConn.onEvent(
        (evt: {
          type: string;
          text?: string;
          name?: string;
          args?: Record<string, unknown>;
          requestId?: string;
          error?: string;
        }) => {
          console.log("Live event received:", evt);
          addDebugLog(
            `Event: ${evt.type} ${
              evt.text ? `- "${evt.text.substring(0, 50)}..."` : ""
            }`
          );

          if (evt.type === "agent_says" && evt.text) {
            console.log("Agent says:", evt.text);
            addDebugLog(`Agent response: ${evt.text}`);
            setQueue((q) => [...q, evt.text!]);
          } else if (evt.type === "partial_transcript" && evt.text) {
            console.log("Partial transcript:", evt.text);
            setPartial(evt.text);
          } else if (
            evt.type === "tool_call" &&
            evt.name === "updateAnswer" &&
            evt.args
          ) {
            console.log("🔧 Tool call received:", evt.args);
            console.log("🔧 Tool call request ID:", evt.requestId);
            addDebugLog(
              `Tool call for question ${evt.args.question_id}: ${evt.args.answer_text}`
            );
            setAnsweredCount((c) => c + 1);
            mergeAnswer(evt.args as Partial<Answer> & { question_id: number });

            // Send response back to agent
            console.log("📤 Sending tool result back to agent");
            liveConn.sendControl({
              type: "tool_result",
              name: "updateAnswer",
              requestId: evt.requestId,
              output: { ok: true, message: "Answer recorded successfully" },
            });
          } else if (evt.type === "done") {
            console.log("Session done");
            addDebugLog("Session completed");
            setStatus("All set. Thanks!");
            setPhase("done");
            cleanup();
          } else if (evt.type === "error") {
            console.error("Live session error:", evt.error);
            addDebugLog(`Error: ${evt.error}`);
            setStatus(evt.error || "Live error");
            setPhase("error");
            cleanup();
          }
        }
      );

      setStatus("Starting microphone...");
      addDebugLog("Starting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Instead of MediaRecorder, use Web Audio API for PCM data
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);

      // Create a script processor to get raw PCM data
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (liveConnRef.current) {
          const inputData = event.inputBuffer.getChannelData(0);

          // Convert Float32 to Int16 PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }

          console.log("Sending PCM audio chunk, samples:", pcmData.length);
          liveConnRef.current.sendAudio(pcmData.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Store the audio context for cleanup
      (streamRef.current as any).audioContext = audioContext;
      (streamRef.current as any).processor = processor;

      setStatus("Live session active - Listening...");
      addDebugLog("PCM audio recording started, waiting for agent...");
      console.log("PCM audio started, sample rate:", audioContext.sampleRate);

      // Start the interview after microphone is ready
      setTimeout(() => {
        if (liveConnRef.current) {
          console.log("🎯 Starting interview...");
          addDebugLog("Starting interview with questions...");
          liveConnRef.current.startInterview();
        }
      }, 1000); // Give a second for everything to be ready

      stopperRef.current = window.setTimeout(() => {
        cleanup();
        setStatus("Session ended (timeout)");
        setPhase("done");
      }, autoStopMs);
    } catch (error) {
      setStatus(`Error: ${error}`);
      setPhase("error");
    }
  }

  function stop() {
    cleanup();
    setPhase("done");
    setStatus("Session ended");
  }

  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
      <h3>Live Follow-up Session</h3>
      <p>Session ID: {sessionId}</p>
      <p>
        Status: <strong>{status}</strong>
      </p>
      <p>Questions to ask: {questions.length}</p>
      <p>Answered so far: {answeredCount}</p>

      {phase === "idle" && (
        <button
          onClick={start}
          style={{
            padding: "12px 24px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Start Live Session
        </button>
      )}

      {phase === "live" && (
        <button
          onClick={stop}
          style={{
            padding: "12px 24px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Stop Session
        </button>
      )}

      {partial && (
        <div style={{ marginTop: 16, padding: 8, backgroundColor: "#f8f9fa" }}>
          <strong>You're saying:</strong> {partial}
        </div>
      )}

      {queue.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Conversation:</h4>
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid #ddd",
              padding: 8,
            }}
          >
            {queue.map((msg, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 8,
                  padding: 4,
                  backgroundColor: "#e3f2fd",
                }}
              >
                <strong>Agent:</strong> {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Questions to be asked:</h4>
          <ol>
            {questions.map((q) => (
              <li key={q.id}>
                {q.question_text} <small>({q.question_frontend_stamp})</small>
              </li>
            ))}
          </ol>
        </div>
      )}

      {debugLogs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Debug Logs:</h4>
          <div
            style={{
              maxHeight: 150,
              overflowY: "auto",
              border: "1px solid #ddd",
              padding: 8,
              fontSize: "12px",
              backgroundColor: "#f8f9fa",
            }}
          >
            {debugLogs.map((log, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
