import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QuestLog } from "./QuestLog";
import type { QuestListEntry } from "../api/questsClient";

afterEach(() => {
  cleanup();
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
});
