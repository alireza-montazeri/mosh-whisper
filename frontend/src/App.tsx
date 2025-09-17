import VoiceIntake from "./components/VoiceIntake";
import moshLogo from "./assets/mosh-logo.svg"

export default function App() {
  return (
    <>
      <section className="w-full p-4 bg-neutral-200 flex justify-center">
        <div className="w-90">
          <img src={moshLogo} className="text-white" alt="React logo" />
        </div>
      </section>
      <div
        className="text-white"
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 24,
        }}
      >
        <div className="p-4 py-8">
          <h2>Mosh Voice Intake (Gemini Live)</h2>
          <p>
            Try: “Hair thinning at temples for a year; dad bald; used minoxidil; no
            allergies.”
          </p>
        </div>
        <VoiceIntake />
      </div>
    </>
  );
}
