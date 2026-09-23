import { PhaserGame } from "./game/PhaserGame";
import { DialogueBubble } from "./components/DialogueBubble";
import { AppHeader } from "./components/AppHeader";
import { DEFAULT_NPC, getWelcomeMessage } from "./dialogue/welcomeMessage";
import "./App.css";

export function App() {
  const welcomeText = getWelcomeMessage(DEFAULT_NPC);

  return (
    <div className="app">
      <AppHeader />
      <div className="scene-wrapper">
        <PhaserGame />
        <DialogueBubble npc={DEFAULT_NPC} text={welcomeText} />
      </div>
    </div>
  );
}
