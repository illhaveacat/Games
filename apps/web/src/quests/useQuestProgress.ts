import { useCallback, useEffect, useState } from "react";
import { fetchPlayerProgress, fetchQuests, type PlayerProgressView, type QuestListEntry } from "../api/questsClient";

export interface QuestProgressState {
  quests: QuestListEntry[];
  playerProgress: PlayerProgressView | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/** 挂载时拉一次任务列表 + 玩家进度；暴露 refresh() 供完成任务后手动刷新显示。 */
export function useQuestProgress(): QuestProgressState {
  const [quests, setQuests] = useState<QuestListEntry[]>([]);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgressView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [questsData, progressData] = await Promise.all([fetchQuests(), fetchPlayerProgress()]);
      setQuests(questsData);
      setPlayerProgress(progressData);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { quests, playerProgress, loading, error, refresh };
}
