import { useState } from "react";
import type { DialogueResponse } from "@games/shared";
import { PhaserGame } from "./game/PhaserGame";
import { DialogueBubble } from "./components/DialogueBubble";
import { AppHeader } from "./components/AppHeader";
import { VoiceDialogueInput } from "./components/VoiceDialogueInput";
import { DEFAULT_NPC, getWelcomeMessage } from "./dialogue/welcomeMessage";
import "./App.css";

export function App() {
  const [dialogue, setDialogue] = useState<DialogueResponse>({
    speakerId: DEFAULT_NPC.id,
    text: getWelcomeMessage(DEFAULT_NPC),
    timestamp: Date.now(),
  });

  return (
    <div className="app">
      <AppHeader />
      <div className="scene-wrapper">
        <PhaserGame />
        <DialogueBubble npc={DEFAULT_NPC} text={dialogue.text} />
      </div>
      <VoiceDialogueInput npcId={DEFAULT_NPC.id} onReply={setDialogue} />
    </div>
  );
}
