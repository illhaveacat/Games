import { useCallback, useState } from "react";
import type { DialogueResponse } from "@games/shared";
import { PhaserGame } from "./game/PhaserGame";
import { useTalkingIndicator } from "./game/useTalkingIndicator";
import { DialogueBubble } from "./components/DialogueBubble";
import { AppHeader } from "./components/AppHeader";
import { QuestPanel } from "./components/QuestPanel";
import { VoiceDialogueInput } from "./components/VoiceDialogueInput";
import { DEFAULT_NPC, getWelcomeMessage } from "./dialogue/welcomeMessage";
import { useQuestProgress } from "./quests/useQuestProgress";
import "./App.css";

export function App() {
  const [dialogue, setDialogue] = useState<DialogueResponse>({
    speakerId: DEFAULT_NPC.id,
    text: getWelcomeMessage(DEFAULT_NPC),
    timestamp: Date.now(),
  });
  const talking = useTalkingIndicator(dialogue.text, dialogue.timestamp);
  const questProgress = useQuestProgress();

  // 对话推进/完成任务后，任务日志和等级/积分要自动更新，不需要玩家手动点刷新（STAGE-001）：
  // 每收到一次 NPC 回复就顺带刷新一次任务进度。刷新成本很低（两个 GET），
  // 不去费劲判断"这次回复是不是真的改了任务状态"，简单可靠更重要。
  const handleReply = useCallback(
    (reply: DialogueResponse) => {
      setDialogue(reply);
      questProgress.refresh();
    },
    [questProgress],
  );

  return (
    <div className="app">
      <AppHeader />
      <div className="scene-wrapper">
        <PhaserGame talking={talking} />
        <DialogueBubble npc={DEFAULT_NPC} text={dialogue.text} />
      </div>
      <VoiceDialogueInput npcId={DEFAULT_NPC.id} onReply={handleReply} />
      <QuestPanel
        status={questProgress.status}
        quests={questProgress.quests}
        playerProgress={questProgress.playerProgress}
        onRefresh={questProgress.refresh}
      />
    </div>
  );
}
