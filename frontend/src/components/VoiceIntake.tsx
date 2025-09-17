import { useEffect, useRef, useState } from "react";

type ExtractResponse = {
  answers: Array<{
    question_id: number;
    question_text: string | null;
    question_frontend_stamp: string | null;
    answer_id?: number | null;
    answer_text?: string | null;
    answer_frontend_stamp?: string | null;
    type: string;
    confidence: number;
    evidence: string;
  }>;
  derived: {
    height_cm: number | null;
    weight_kg: number | null;
    bmi: number | null;
  };
  unanswered: Array<{
    question_id: number;
    question_text: string | null;
    question_frontend_stamp: string | null;
  }>;
  warnings: string[];
};

type Props = {
  onExtractionComplete?: (result: ExtractResponse) => void;
};

const API_ENDPOINT = "http://localhost:8585/api/intake/recording";
const MAX_MS = 60_000;

export default function VoiceIntake({ onExtractionComplete }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ExtractResponse | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopTimerRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>("");

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopRecordingInternal({ keepState: false });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  function pickSupportedMime(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4", // Safari
    ];
    for (const t of candidates) {
      try {
        if (
          (
            window as Window & typeof globalThis
          ).MediaRecorder?.isTypeSupported?.(t)
        )
          return t;
      } catch {
        /* noop */
      }
    }
    return ""; // let browser choose
  }

  async function startRecording() {
    setError(null);
    setResult(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mime = pickSupportedMime();
      mimeTypeRef.current = mime;

      const mr = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );

      chunksRef.current = [];
      mr.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, {
            type: mimeTypeRef.current || mr.mimeType || "audio/webm",
          });
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          await uploadRecording(blob);
        } catch (e: unknown) {
          if (e && typeof e === "object" && "message" in e) {
            setError(
              (e as { message?: string }).message ||
                "Failed to process recording."
            );
          } else {
            setError("Failed to process recording.");
          }
        }
      };

      streamRef.current = stream;
      mediaRecorderRef.current = mr;

      mr.start(250); // collect small chunks
      setIsRecording(true);
      setElapsedMs(0);
      startTimeRef.current = performance.now();

      // timer ui
      const tick = () => {
        const now = performance.now();
        const ms = now - startTimeRef.current;
        setElapsedMs(ms);
        if (ms >= MAX_MS) {
          stopRecordingInternal();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      // hard auto-stop guard
      autoStopTimerRef.current = window.setTimeout(() => {
        stopRecordingInternal();
      }, MAX_MS);
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "name" in e) {
        setError(
          (e as { name?: string; message?: string }).name === "NotAllowedError"
            ? "Microphone permission was denied."
            : (e as { message?: string }).message ||
                "Could not access microphone."
        );
      } else {
        setError("Could not access microphone.");
      }
      cleanupStream();
    }
  }

  function stopRecording() {
    stopRecordingInternal();
  }

  function stopRecordingInternal(opts: { keepState?: boolean } = {}) {
    const { keepState = true } = opts;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoStopTimerRef.current != null) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }

    if (!keepState) {
      setIsRecording(false);
      setElapsedMs(0);
    } else {
      setIsRecording(false);
    }

    cleanupStream();
  }

  function cleanupStream() {
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  async function uploadRecording(blob: Blob) {
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const fileExt =
        (mimeTypeRef.current.includes("mp4") && "m4a") ||
        (mimeTypeRef.current.includes("ogg") && "ogg") ||
        "webm";

      const form = new FormData();
      form.append(
        "audio",
        new File([blob], `recording.${fileExt}`, {
          type: blob.type || mimeTypeRef.current,
        })
      );

      // Optional: include any hints or metadata your API might want:
      // form.append("hint_language", "en-AU");

      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
      }

      const json = await res.json();
      // The backend returns { result: ExtractResponse }, so we need to extract the result
      const extractionResult = json.result as ExtractResponse;
      setResult(extractionResult);

      // Notify parent component that extraction is complete
      if (onExtractionComplete) {
        onExtractionComplete(extractionResult);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message || "Upload failed.");
      } else {
        setError("Upload failed.");
      }
    } finally {
      setUploading(false);
    }
  }

  function resetAll() {
    setIsRecording(false);
    setElapsedMs(0);
    setError(null);
    setUploading(false);
    setResult(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    chunksRef.current = [];
  }

  return (
    <div className="max-w-xl mx-auto p-4 border rounded-lg">
      <h2 className="text-xl font-semibold mb-2">Voice capture (up to 1:00)</h2>

      <div className="flex items-center gap-3 mb-3">
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            isRecording ? "bg-red-600 animate-pulse" : "bg-gray-400"
          }`}
          aria-label={isRecording ? "Recording" : "Idle"}
        />
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>

      <div className="flex gap-2 mb-3">
        {!isRecording ? (
          <button
            className="px-4 py-2 rounded bg-black text-white"
            onClick={startRecording}
          >
            Start recording
          </button>
        ) : (
          <button
            className="px-4 py-2 rounded bg-red-600 text-white"
            onClick={stopRecording}
          >
            Stop
          </button>
        )}

        <button
          className="px-4 py-2 rounded border"
          onClick={resetAll}
          disabled={isRecording || uploading}
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="p-3 mb-3 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {audioUrl && (
        <div className="mb-4">
          <p className="text-sm mb-1">Preview:</p>
          <audio src={audioUrl} controls />
        </div>
      )}

      {uploading && (
        <div className="flex items-center space-x-3 text-sm text-gray-600 py-4">
          {/* Spinning circle loader */}
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-600"></div>

          {/* Animated text with dots */}
          <div className="flex items-center text-white space-x-1">
            <span>Uploading & processing...</span>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Extraction result</h3>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-80">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">
        Tips: iOS/Safari requires tapping “Start recording” to grant mic access.
        Recording will auto-stop at 1 minute.
      </p>
    </div>
  );
}
