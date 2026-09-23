import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QuestLog } from "./QuestLog";
import type { QuestListEntry } from "../api/questsClient";
import i18n from "../i18n";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

function quest(id: string, status: QuestListEntry["progress"]["status"]): QuestListEntry {
  return {
    quest: { id, npcId: "npc-barista", title: `Quest ${id}`, completionCriteria: "c", rewardXp: 10, rewardPoints: 5 },
    progress: { questId: id, status },
  };
}

describe("QuestLog", () => {
  it("shows an empty state when there are no quests", () => {
    render(<QuestLog quests={[]} />);
    expect(screen.getByText("No quests yet.")).toBeInTheDocument();
  });

  it("renders each quest's title and a human-readable label for its status (not a raw enum value)", () => {
    render(
      <QuestLog
        quests={[quest("q1", "not_started"), quest("q2", "in_progress"), quest("q3", "completed")]}
      />,
    );

    expect(screen.getByText("Quest q1")).toBeInTheDocument();
    expect(screen.getByTestId("quest-status-q1")).toHaveTextContent("Not started");
    expect(screen.getByTestId("quest-status-q2")).toHaveTextContent("In progress");
    expect(screen.getByTestId("quest-status-q3")).toHaveTextContent("Completed");
  });

  it("falls back to the server-provided title/description when there's no i18n translation for that quest id", () => {
    render(<QuestLog quests={[quest("some-未来-quest-not-yet-translated", "not_started")]} />);
    expect(screen.getByText("Quest some-未来-quest-not-yet-translated")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument(); // completionCriteria 兜底值
  });

  it("translates the real cafe-opening quest titles/descriptions and switches with the UI language", async () => {
    const cafeQuest: QuestListEntry = {
      quest: {
        id: "quest-greet-barista",
        npcId: "npc-barista",
        title: "server default title",
        completionCriteria: "server default description",
        rewardXp: 40,
        rewardPoints: 10,
      },
      progress: { questId: "quest-greet-barista", status: "not_started" },
    };

    const { rerender } = render(<QuestLog quests={[cafeQuest]} />);
    expect(screen.getByText("Greet the barista")).toBeInTheDocument();
    expect(screen.getByText(/mention you're new in town/)).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("zh");
    });
    rerender(<QuestLog quests={[cafeQuest]} />);
    expect(screen.getByText("跟咖啡师打招呼")).toBeInTheDocument();
    expect(screen.getByText("用英语跟咖啡师打招呼（比如说 hello，再提一句你是新来的）。")).toBeInTheDocument();
    expect(screen.queryByText("Greet the barista")).not.toBeInTheDocument();
  });
});
