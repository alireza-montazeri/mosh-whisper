import { useState } from "react";
import VoiceIntake from "./components/VoiceIntake";
import FollowUpLiveSession from "./components/FollowUpLiveSession";

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

// Type that matches the backend's Extraction type for FollowUpLiveSession
type BackendExtraction = {
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
  unanswered: Array<{
    question_id: number;
    question_text?: string | null;
    question_frontend_stamp?: string | null;
  }>;
  derived: Record<string, unknown>;
  warnings: string[];
};

export default function App() {
  const [extractionResult, setExtractionResult] =
    useState<ExtractResponse | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [showLiveSession, setShowLiveSession] = useState(false);

  const handleExtractionComplete = (result: ExtractResponse) => {
    setExtractionResult(result);
    setShowLiveSession(true);
  };

  // Convert ExtractResponse to BackendExtraction format
  const convertToBackendFormat = (
    result: ExtractResponse
  ): BackendExtraction => {
    console.log("🔄 convertToBackendFormat called with:", result);
    const converted = {
      answers: result.answers,
      unanswered: result.unanswered.map((u) => ({
        question_id: u.question_id,
        question_text: u.question_text,
        question_frontend_stamp: u.question_frontend_stamp,
      })),
      derived: result.derived as Record<string, unknown>,
      warnings: result.warnings,
    };
    console.log("🔄 convertToBackendFormat result:", converted);
    return converted;
  };

  const handleExtractionUpdate = (updatedExtraction: BackendExtraction) => {
    console.log("🔄 handleExtractionUpdate called with:", updatedExtraction);
    console.log("🔄 Current extractionResult before update:", extractionResult);

    // Convert back to ExtractResponse format for display
    const convertedResult: ExtractResponse = {
      answers: updatedExtraction.answers,
      unanswered: updatedExtraction.unanswered.map((u) => ({
        question_id: u.question_id,
        question_text: u.question_text || null,
        question_frontend_stamp: u.question_frontend_stamp || null,
      })),
      derived: {
        height_cm: (updatedExtraction.derived.height_cm as number) || null,
        weight_kg: (updatedExtraction.derived.weight_kg as number) || null,
        bmi: (updatedExtraction.derived.bmi as number) || null,
      },
      warnings: updatedExtraction.warnings,
    };

    console.log("🔄 Converted result:", convertedResult);
    setExtractionResult(convertedResult);
  };

  const resetSession = () => {
    setExtractionResult(null);
    setShowLiveSession(false);
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: 24,
      }}
    >
      <h2>Mosh Whisper</h2>
      <p>
        Try: "Hair thinning at temples for a year; dad bald; used minoxidil; no
        allergies."
      </p>

      {!showLiveSession ? (
        <VoiceIntake onExtractionComplete={handleExtractionComplete} />
      ) : (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">
              Initial Extraction Complete
            </h3>
            <div className="text-sm text-gray-600 mb-4">
              Found {extractionResult?.answers.length || 0} answers,{" "}
              {extractionResult?.unanswered.length || 0} questions remaining
            </div>
            <button
              onClick={resetSession}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Start New Recording
            </button>
          </div>

          {extractionResult && (
            <FollowUpLiveSession
              sessionId={sessionId}
              extraction={convertToBackendFormat(extractionResult)}
              onUpdateExtraction={handleExtractionUpdate}
              apiKey={import.meta.env.VITE_GEMINI_API_KEY || ""}
            />
          )}

          <div className="mt-6">
            <h4 className="font-medium mb-2">Current Extraction Status</h4>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-80">
              {JSON.stringify(extractionResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
