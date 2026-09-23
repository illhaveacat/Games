import { useTranslation } from "react-i18next";
import type { PlayerProgressView, QuestListEntry } from "../api/questsClient";
import type { QuestProgressStatus } from "../quests/useQuestProgress";
import { PlayerStatus } from "./PlayerStatus";
import { QuestLog } from "./QuestLog";
import "../i18n";
import "./QuestPanel.css";

interface QuestPanelProps {
  status: QuestProgressStatus;
  quests: QuestListEntry[];
  playerProgress: PlayerProgressView | null;
  onRefresh: () => void;
}

/**
 * 任务日志 + 等级/积分 + 已解锁内容展示，数据由父组件（App）通过 useQuestProgress 提供并驱动，
 * 本组件是纯展示层：完成任务后（对话推进 -> App 调 refresh()）会自动重新渲染，不需要玩家手动点刷新；
 * "刷新"按钮仍然保留作为手动兜底（比如怀疑数据不同步时）。
 *
 * status 三态：
 * - loading：从未成功加载过时显示加载态，不会闪出"暂无任务"空状态。
 * - error：加载失败，显示错误提示 + 可点的重试按钮。
 * - loaded：正常渲染任务日志/等级积分/已解锁内容。
 */
export function QuestPanel({ status, quests, playerProgress, onRefresh }: QuestPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="quest-panel" data-testid="quest-panel">
      <div className="quest-panel__header">
        <PlayerStatus progress={playerProgress} />
        <button type="button" onClick={onRefresh} disabled={status === "loading"} data-testid="quest-panel-refresh">
          {t("questLog.refresh")}
        </button>
      </div>

      {status === "loading" && (
        <p className="quest-panel__loading" data-testid="quest-panel-loading">
          {t("questLog.loading")}
        </p>
      )}

      {status === "error" && (
        <div className="quest-panel__error" role="alert" data-testid="quest-panel-error">
          <p>{t("questLog.error")}</p>
          <button type="button" onClick={onRefresh} data-testid="quest-panel-retry">
            {t("questLog.retry")}
          </button>
        </div>
      )}

      {status === "loaded" && (
        <>
          {playerProgress && playerProgress.unlocks.length > 0 && (
            <ul className="quest-panel__unlocks" data-testid="quest-panel-unlocks">
              {playerProgress.unlocks.map((unlockId) => (
                <li key={unlockId}>{t(`unlocks.${unlockId}`, { defaultValue: unlockId })}</li>
              ))}
            </ul>
          )}
          <QuestLog quests={quests} />
        </>
      )}
    </section>
  );
}
