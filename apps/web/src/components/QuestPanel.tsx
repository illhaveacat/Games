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
 * 是否已经有数据（playerProgress !== null）跟 status 是两个独立维度：
 * - 从未成功加载过（无数据）+ loading -> 显示整版加载态。
 * - 从未成功加载过（无数据）+ error -> 显示整版错误态 + 重试按钮，没有别的内容可显示。
 * - 已经成功加载过一次之后，某次后台 refresh（比如对话推进任务后自动触发的那次）失败了
 *   -> status 是 error，但 playerProgress/quests 还是上一次成功加载的数据，不清空——
 *      只在已有内容上面叠一条小的"刷新失败，重试"提示条，不会把整个任务日志和等级积分换成错误页
 *      （这是 rev-01 review 指出的问题：之前 error 状态会无条件隐藏已有数据，
 *      跟 useQuestProgress 自己的注释"不会抹掉已显示内容"矛盾）。
 * - loaded：正常渲染，不需要额外处理。
 */
export function QuestPanel({ status, quests, playerProgress, onRefresh }: QuestPanelProps) {
  const { t } = useTranslation();
  const hasData = playerProgress !== null;

  return (
    <section className="quest-panel" data-testid="quest-panel">
      <div className="quest-panel__header">
        <PlayerStatus progress={playerProgress} />
        <button type="button" onClick={onRefresh} disabled={status === "loading"} data-testid="quest-panel-refresh">
          {t("questLog.refresh")}
        </button>
      </div>

      {status === "loading" && !hasData && (
        <p className="quest-panel__loading" data-testid="quest-panel-loading">
          {t("questLog.loading")}
        </p>
      )}

      {status === "error" && !hasData && (
        <div className="quest-panel__error" role="alert" data-testid="quest-panel-error">
          <p>{t("questLog.error")}</p>
          <button type="button" onClick={onRefresh} data-testid="quest-panel-retry">
            {t("questLog.retry")}
          </button>
        </div>
      )}

      {status === "error" && hasData && (
        <div className="quest-panel__inline-error" role="alert" data-testid="quest-panel-inline-error">
          <span>{t("questLog.error")}</span>
          <button type="button" onClick={onRefresh} data-testid="quest-panel-retry">
            {t("questLog.retry")}
          </button>
        </div>
      )}

      {(status === "loaded" || (status === "error" && hasData)) && (
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
