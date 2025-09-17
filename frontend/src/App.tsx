import { useState, useMemo } from "react";
import VoiceIntake from "./components/VoiceIntake";
import moshLogo from "./assets/mosh-logo.svg";
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
    console.log(
      "🔄 Number of answers in update:",
      updatedExtraction.answers.length
    );
    console.log(
      "🔄 Answer details:",
      updatedExtraction.answers.map(
        (a) => `Q${a.question_id}: ${a.answer_text}`
      )
    );

    // Convert back to ExtractResponse format for display
    // Merge new answers with existing ones, avoiding duplicates
    const existingAnswers = extractionResult?.answers || [];
    const newAnswers = updatedExtraction.answers;

    console.log("🔄 Existing answers count:", existingAnswers.length);
    console.log("🔄 New answers count:", newAnswers.length);
    console.log(
      "🔄 Existing answers:",
      existingAnswers.map((a) => `Q${a.question_id}: ${a.answer_text}`)
    );
    console.log(
      "🔄 New answers:",
      newAnswers.map((a) => `Q${a.question_id}: ${a.answer_text}`)
    );

    // Create a map of existing answers by question_id for easy lookup
    const existingAnswersMap = new Map();
    existingAnswers.forEach((answer) => {
      existingAnswersMap.set(answer.question_id, answer);
    });

    // Merge answers - update existing or add new ones
    const mergedAnswers = [...existingAnswers];
    newAnswers.forEach((newAnswer) => {
      const existingIndex = mergedAnswers.findIndex(
        (a) => a.question_id === newAnswer.question_id
      );
      if (existingIndex >= 0) {
        // Update existing answer
        console.log(
          "🔄 Updating existing answer for question",
          newAnswer.question_id
        );
        mergedAnswers[existingIndex] = newAnswer;
      } else {
        // Add new answer
        console.log("🔄 Adding new answer for question", newAnswer.question_id);
        mergedAnswers.push(newAnswer);
      }
    });

    console.log("🔄 Merged answers count:", mergedAnswers.length);
    console.log(
      "🔄 Merged answers:",
      mergedAnswers.map((a) => `Q${a.question_id}: ${a.answer_text}`)
    );

    const convertedResult: ExtractResponse = {
      answers: mergedAnswers,
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
    console.log(
      "🔄 Setting extractionResult with answers:",
      convertedResult.answers.length
    );
    setExtractionResult(convertedResult);
  };

  const resetSession = () => {
    setExtractionResult(null);
    setShowLiveSession(false);
  };

  // Memoize the extraction prop to prevent unnecessary re-renders
  const memoizedExtraction = useMemo(
    () => (extractionResult ? convertToBackendFormat(extractionResult) : null),
    [extractionResult]
  );

  return (
    <>
      <div className="p-8 flex justify-center">
        <div className="w-80">
          <img src={moshLogo} />
        </div>
      </div>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 24,
        }}
        className="text-white flex flex-col justify-center"
      >
        <h2 className="flex justify-center text-2xl font-bold mb-5">
          Mosh Whisper
        </h2>

        {!showLiveSession ? (
          <VoiceIntake onExtractionComplete={handleExtractionComplete} />
        ) : (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">
                Initial Extraction Complete
              </h3>
              <div className="text-2xl  mb-4 text-white">
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

            {extractionResult && memoizedExtraction && (
              <FollowUpLiveSession
                sessionId={sessionId}
                extraction={memoizedExtraction}
                onUpdateExtraction={handleExtractionUpdate}
                apiKey={import.meta.env.VITE_GEMINI_API_KEY || ""}
              />
            )}

            <div className="mt-6">
              <h4 className="font-medium mb-2">Current Extraction Status</h4>
              <pre className="text-xs bg-neutral-700 p-3 rounded overflow-auto max-h-[500px]">
                {JSON.stringify(extractionResult, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
