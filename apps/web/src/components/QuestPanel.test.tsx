import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuestPanel } from "./QuestPanel";
import type { PlayerProgressView, QuestListEntry } from "../api/questsClient";

afterEach(() => {
  cleanup();
});

const quests: QuestListEntry[] = [
  {
    quest: { id: "quest-greet-barista", npcId: "npc-barista", title: "Greet", completionCriteria: "c", rewardXp: 40, rewardPoints: 10 },
    progress: { questId: "quest-greet-barista", status: "completed" },
  },
];
const progress: PlayerProgressView = {
  level: 2,
  xp: 100,
  points: 25,
  completedQuestIds: ["quest-greet-barista"],
  unlocks: ["npc-barista-extra-line"],
};

describe("QuestPanel", () => {
  it("shows the loading state (not an empty quest list) while status is 'loading'", () => {
    render(<QuestPanel status="loading" quests={[]} playerProgress={null} onRefresh={() => {}} />);
    expect(screen.getByTestId("quest-panel-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("quest-log")).not.toBeInTheDocument();
    expect(screen.queryByText("No quests yet.")).not.toBeInTheDocument();
  });

  it("shows an error state with a retry button while status is 'error', and calls onRefresh when retry is clicked", () => {
    const onRefresh = vi.fn();
    render(<QuestPanel status="error" quests={[]} playerProgress={null} onRefresh={onRefresh} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load quest progress");

    fireEvent.click(screen.getByTestId("quest-panel-retry"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders quest log, level/points, and unlocked content when status is 'loaded'", () => {
    render(<QuestPanel status="loaded" quests={quests} playerProgress={progress} onRefresh={() => {}} />);

    expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 2");
    expect(screen.getByTestId("player-status-points")).toHaveTextContent("25 pts");
    expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Completed");
    expect(screen.getByTestId("quest-panel-unlocks")).toHaveTextContent("new story to share");
    expect(screen.queryByTestId("quest-panel-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quest-panel-error")).not.toBeInTheDocument();
  });

  it("does not render the unlocks list when there are no unlocks yet", () => {
    render(
      <QuestPanel
        status="loaded"
        quests={quests}
        playerProgress={{ ...progress, unlocks: [] }}
        onRefresh={() => {}}
      />,
    );
    expect(screen.queryByTestId("quest-panel-unlocks")).not.toBeInTheDocument();
  });

  it("clicking the manual refresh button calls onRefresh", () => {
    const onRefresh = vi.fn();
    render(<QuestPanel status="loaded" quests={quests} playerProgress={progress} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByTestId("quest-panel-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the already-loaded quest log/level/points when a background refresh fails (status='error' but data is present), with an inline retry bar instead of hiding everything", () => {
    const onRefresh = vi.fn();
    render(<QuestPanel status="error" quests={quests} playerProgress={progress} onRefresh={onRefresh} />);

    // 数据还在：不是那种"加载失败就把整个面板清空"的行为
    expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 2");
    expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Completed");
    expect(screen.getByTestId("quest-panel-unlocks")).toBeInTheDocument();
    // 不是"从未加载过"那种整版错误态
    expect(screen.queryByTestId("quest-panel-error")).not.toBeInTheDocument();

    const inlineError = screen.getByTestId("quest-panel-inline-error");
    expect(inlineError).toHaveTextContent("Couldn't load quest progress");
    fireEvent.click(screen.getByTestId("quest-panel-retry"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
