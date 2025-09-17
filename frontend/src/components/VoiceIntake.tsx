import { useRef, useState } from "react";
import {
  GoogleGenAI,
  Modality,
  LiveServerMessage,
  FunctionResponse,
} from "@google/genai";
import type {
  LiveConnectConfig,
  LiveCallbacks,
  FunctionDeclaration,
  Session,
} from "@google/genai";
import { submitIntakeTool } from "../lib/submitIntakeTool";

// Use types from @google/genai

export default function VoiceIntake() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [unknowns, setUnknowns] = useState<string[]>([]);
  const cleanupRef = useRef<() => void>(null);
  const sessionRef = useRef<Session | null>(null);

  const push = (...parts: string[]) => setLog((l) => [...l, parts.join(" ")]);

  async function speak(text: string) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }

  async function start() {
    setRunning(true);
    try {
      // 1) get ephemeral token from backend
      const t = await fetch("http://localhost:8585/api/ephemeral", {
        method: "POST",
      }).then((r) => r.json());
      const token = t.token as string;

      // 2) connect Live
      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const model = "gemini-2.0-flash-live-001";
      const config: LiveConnectConfig = {
        responseModalities: [Modality.TEXT],
        tools: [
          { functionDeclarations: [submitIntakeTool as FunctionDeclaration] },
        ],
        systemInstruction:
          "You are Mosh’s clinical intake agent. Gather only what a GP needs. " +
          "Never diagnose. Always ask about medications, allergies, and red flags. " +
          "Keep replies under 10 seconds. Ask at most 5 clarifying questions. " +
          "When confident, call submit_intake.",
      };

      const responseQueue: LiveServerMessage[] = [];
      const callbacks: LiveCallbacks = {
        onopen() {
          push("🔌 Live session opened");
        },
        onmessage(msg) {
          responseQueue.push(msg);
        },
        onerror(e) {
          console.error(e);
          push("💥", e.message);
        },
        onclose(e) {
          push("🔒 Session closed", e?.reason || "");
        },
      };
      const session = await ai.live.connect({
        model,
        config,
        callbacks,
      });
      sessionRef.current = session;

      // 3) stream microphone -> 16k PCM -> Live
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000 });
      await ctx.audioWorklet.addModule("/pcm-worklet.js");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm16k-writer");
      src.connect(node);
      node.port.onmessage = (ev: MessageEvent<Int16Array>) => {
        const pcm = new Uint8Array(ev.data.buffer);
        const b64 = btoa(String.fromCharCode(...pcm));
        session.sendRealtimeInput({
          audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
        });
      };

      // helper to read queue sequentially
      async function nextMessage(): Promise<LiveServerMessage> {
        return await new Promise((resolve) => {
          const poll = () =>
            responseQueue.length
              ? resolve(responseQueue.shift()!)
              : setTimeout(poll, 80);
          poll();
        });
      }

      // 4) consume turns
      (async function consume() {
        while (true) {
          const msg = await nextMessage();

          // TEXT from model
          if (msg?.text) {
            push("🧠", msg.text);
            speak(msg.text);
          }

          // TOOL CALL(s)
          if (msg?.toolCall?.functionCalls?.length) {
            const fcs = msg.toolCall.functionCalls ?? [];
            push("🛠️ tool calls:", fcs.map((f) => f.name).join(", "));

            const functionResponses: FunctionResponse[] = [];
            for (const fc of fcs) {
              if (fc.name === "submit_intake") {
                // send to backend
                const r = await fetch(
                  "http://localhost:8585/api/tools/submit-intake",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(fc.args),
                  }
                ).then((x) => x.json());

                // show follow-up chips
                setUnknowns(
                  Array.isArray(fc.args?.unknowns)
                    ? (fc.args?.unknowns as string[])
                    : []
                );
                functionResponses.push({
                  id: fc.id,
                  name: fc.name,
                  response: r as Record<string, unknown>,
                });
              } else {
                functionResponses.push({
                  id: fc.id,
                  name: fc.name,
                  response: { ok: true },
                });
              }
            }
            // IMPORTANT: send tool responses back to Live
            session.sendToolResponse({ functionResponses });
          }
        }
      })();

      // stash cleanup
      cleanupRef.current = () => {
        node.disconnect();
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        session.close();
      };
    } catch (e) {
      if (e instanceof Error) {
        push("💥", e.message);
      } else {
        push("💥", String(e));
      }
      setRunning(false);
    }
  }

  function stop() {
    cleanupRef.current?.();
    setRunning(false);
  }

  // let user tap quick follow-ups
  async function answerUnknown(q: string) {
    const ans = prompt(q) || "skip";

    sessionRef.current?.sendClientContent({ turns: `About "${q}": ${ans}` });
    setUnknowns((u) => u.filter((x) => x !== q));
  }

  return (
    <div className="p-4 text-black">
      <div style={{ display: "flex", gap: 8 }} className="text-white">
        {!running ? (
          <button onClick={start} className="p-4 px-8 pr-12 rounded-lg bg-amber-700">🎤 Start</button>
        ) : (
          <button onClick={stop} className="p-4 px-8 pr-12 rounded-lg bg-amber-700">■ Stop</button>
        )}
      </div>

      {unknowns.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div>Follow-ups:</div>
          {unknowns.map((q) => (
            <button
              key={q}
              onClick={() => answerUnknown(q)}
              style={{ margin: 4, borderRadius: 16, padding: "6px 10px" }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <pre
        style={{
          marginTop: 16,
          background: "#f7f7f7",
          padding: 12,
          height: 260,
          overflow: "auto",
        }}
      >
        {log.join("\n")}
      </pre>
    </div>
  );
}
