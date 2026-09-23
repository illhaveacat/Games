import type { NpcProfile } from "../dialogue/welcomeMessage";
import "./DialogueBubble.css";

interface DialogueBubbleProps {
  npc: NpcProfile;
  text: string;
}

export function DialogueBubble({ npc, text }: DialogueBubbleProps) {
  return (
    <div className="dialogue-bubble" role="status" data-testid="dialogue-bubble">
      <span className="dialogue-bubble__speaker">{npc.name}</span>
      <p className="dialogue-bubble__text">{text}</p>
    </div>
  );
}
