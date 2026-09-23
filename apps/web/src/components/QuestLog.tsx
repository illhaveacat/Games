import { useTranslation } from "react-i18next";
import type { QuestListEntry } from "../api/questsClient";
import "../i18n";
import "./QuestLog.css";

interface QuestLogProps {
  quests: QuestListEntry[];
}

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
              <span className="quest-log__quest-title">{quest.title}</span>
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
