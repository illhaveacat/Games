import { useTranslation } from "react-i18next";
import type { QuestListEntry } from "../api/questsClient";
import "../i18n";
import "./QuestLog.css";

interface QuestLogProps {
  quests: QuestListEntry[];
}

/**
 * 任务标题/说明随界面语言切换：优先查 i18n 的 quests.<questId>.title/description，
 * 查不到（比如内容包新增了还没来得及补翻译的任务）就回退到后端返回的原始文本，不会空白。
 * 这跟 NPC 英语学习对话内容（那个不翻译，见 I18N-001 的约定）是两回事——这里翻的是任务日志的
 * UI 文案，不是玩家要用英语练习的那句话本身。
 */
export function QuestLog({ quests }: QuestLogProps) {
  const { t } = useTranslation();

  return (
    <section className="quest-log" aria-label={t("questLog.title")} data-testid="quest-log">
      <h2>{t("questLog.title")}</h2>
      {quests.length === 0 ? (
        <p className="quest-log__empty">{t("questLog.empty")}</p>
      ) : (
        <ul className="quest-log__list">
          {quests.map(({ quest, progress }) => (
            <li key={quest.id} className={`quest-log__item quest-log__item--${progress.status}`}>
              <div className="quest-log__quest-text">
                <span className="quest-log__quest-title">
                  {t(`quests.${quest.id}.title`, { defaultValue: quest.title })}
                </span>
                <span className="quest-log__quest-description">
                  {t(`quests.${quest.id}.description`, { defaultValue: quest.completionCriteria })}
                </span>
              </div>
              <span className="quest-log__status" data-testid={`quest-status-${quest.id}`}>
                {t(`questLog.status.${progress.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
