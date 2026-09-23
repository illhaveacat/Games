import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuestPanel } from "./QuestPanel";
import type { PlayerProgressView, QuestListEntry } from "../api/questsClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const questsBefore: QuestListEntry[] = [
  {
    quest: { id: "quest-greet-barista", npcId: "npc-barista", title: "Greet the barista", completionCriteria: "c", rewardXp: 40, rewardPoints: 10 },
    progress: { questId: "quest-greet-barista", status: "not_started" },
  },
];
const progressBefore: PlayerProgressView = { level: 1, xp: 0, points: 0, completedQuestIds: [], unlocks: [] };

const questsAfter: QuestListEntry[] = [
  {
    quest: { id: "quest-greet-barista", npcId: "npc-barista", title: "Greet the barista", completionCriteria: "c", rewardXp: 40, rewardPoints: 10 },
    progress: { questId: "quest-greet-barista", status: "completed" },
  },
];
const progressAfter: PlayerProgressView = { level: 2, xp: 100, points: 25, completedQuestIds: ["quest-greet-barista"], unlocks: ["npc-barista-extra-line"] };

function mockFetchSequence(sequence: { quests: QuestListEntry[]; progress: PlayerProgressView }[]) {
  let call = 0;
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    // 一轮刷新里 fetchQuests/fetchPlayerProgress 通过 Promise.all 几乎同时发起，
    // 用调用轮次（每两次请求算一轮）而不是先后顺序来决定该返回哪一轮的数据。
    const round = Math.floor(call / 2);
    call += 1;
    const data = sequence[Math.min(round, sequence.length - 1)];
    const body = String(url).includes("/api/quests") ? data.quests : data.progress;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("QuestPanel", () => {
  it("renders quest status and level/points from the backend API on mount, not hardcoded data", async () => {
    mockFetchSequence([{ quests: questsBefore, progress: progressBefore }]);

    render(<QuestPanel />);

    await waitFor(() => expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Not started"));
    expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 1");
    expect(screen.getByTestId("player-status-points")).toHaveTextContent("0 pts");
  });

  it("updates level/points/quest status after refresh, reflecting a completed quest on the backend", async () => {
    mockFetchSequence([
      { quests: questsBefore, progress: progressBefore },
      { quests: questsAfter, progress: progressAfter },
    ]);

    render(<QuestPanel />);

    await waitFor(() => expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 1"));
    expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Not started");

    fireEvent.click(screen.getByTestId("quest-panel-refresh"));

    await waitFor(() => expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 2"));
    expect(screen.getByTestId("player-status-points")).toHaveTextContent("25 pts");
    expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Completed");
  });

  it("shows an error message (not a crash) when the API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    render(<QuestPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load quest progress");
  });
});
