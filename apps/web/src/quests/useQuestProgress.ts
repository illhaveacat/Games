import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPlayerProgress, fetchQuests, type PlayerProgressView, type QuestListEntry } from "../api/questsClient";

export type QuestProgressStatus = "loading" | "loaded" | "error";

export interface QuestProgressState {
  status: QuestProgressStatus;
  quests: QuestListEntry[];
  playerProgress: PlayerProgressView | null;
  refresh: () => void;
}

/**
 * 挂载时拉一次任务列表 + 玩家进度，暴露 refresh() 供完成任务后（含对话推进任务后自动调用）
 * 重新拉取显示最新数值。
 *
 * status 状态机：只有"从未成功加载过"时才显示 loading/error 整版状态（避免每次后台刷新
 * 都闪一下"加载中"或者把已经显示的数据换成错误页）；首次加载成功后，后续 refresh 静默更新数据，
 * 万一某次 refresh 失败也不会抹掉已经在屏幕上的正确内容——但会把 status 标成 error 以便重试。
 */
export function useQuestProgress(): QuestProgressState {
  const [status, setStatus] = useState<QuestProgressStatus>("loading");
  const [quests, setQuests] = useState<QuestListEntry[]>([]);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgressView | null>(null);
  const hasLoadedOnceRef = useRef(false);
  // 每次 load() 自增的请求序号：对话推进很快时可能连续触发好几次 refresh，
  // 网络响应到达的顺序不一定跟发出的顺序一致，旧请求晚到就会用过期数据覆盖新数据。
  // 只有"最新发出的那次请求"的结果才允许真正写进 state，更早发出的请求即使后到也会被忽略。
  const latestRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    if (!hasLoadedOnceRef.current) {
      setStatus("loading");
    }
    try {
      const [questsData, progressData] = await Promise.all([fetchQuests(), fetchPlayerProgress()]);
      if (requestId !== latestRequestIdRef.current) return; // 已经有更新的请求发出了，这次的结果作废
      setQuests(questsData);
      setPlayerProgress(progressData);
      setStatus("loaded");
      hasLoadedOnceRef.current = true;
    } catch {
      if (requestId !== latestRequestIdRef.current) return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { status, quests, playerProgress, refresh };
}
