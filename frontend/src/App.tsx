import VoiceIntake from "./components/VoiceIntake";

export default function App() {
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: 24,
      }}
    >
      <h2>Mosh Voice Intake (Gemini Live)</h2>
      <p>
        Try: “Hair thinning at temples for a year; dad bald; used minoxidil; no
        allergies.”
      </p>
      <VoiceIntake />
    </div>
  );
}
