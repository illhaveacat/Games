import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import type { PlayerProgressView, QuestListEntry } from "./api/questsClient";

// 真实 Phaser.Game 在 jsdom 下没法初始化 Canvas/WebGL（见 game/PhaserGame.test.tsx 的同款 mock），
// 这里不关心 Phaser 场景本身，只是让 App 能在 jsdom 下挂载起来。
vi.mock("phaser", () => {
  class FakeGame {
    events = { once: () => {} };
    scene = { getScene: () => undefined };
    destroy = () => {};
    constructor(_config: unknown) {}
  }
  return { default: { AUTO: "AUTO", Core: { Events: { READY: "ready" } }, Game: FakeGame } };
});
vi.mock("./game/MainScene", () => ({ MainScene: class {} }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const initialQuests: QuestListEntry[] = [
  {
    quest: {
      id: "quest-greet-barista",
      npcId: "npc-barista",
      title: "Greet the barista",
      completionCriteria: "c",
      rewardXp: 40,
      rewardPoints: 10,
    },
    progress: { questId: "quest-greet-barista", status: "not_started" },
  },
];
const initialProgress: PlayerProgressView = { level: 1, xp: 0, points: 0, completedQuestIds: [], unlocks: [] };

const updatedQuests: QuestListEntry[] = [
  { ...initialQuests[0], progress: { questId: "quest-greet-barista", status: "completed" } },
];
const updatedProgress: PlayerProgressView = {
  level: 2,
  xp: 100,
  points: 25,
  completedQuestIds: ["quest-greet-barista"],
  unlocks: [],
};

describe("App: dialogue turns auto-refresh the quest panel (no manual refresh click needed)", () => {
  it("after submitting a dialogue reply, the QuestPanel shows the newly updated level/points/quest status", async () => {
    // 可变引用：初次挂载时后端还是"未开始"状态，玩家跟 NPC 对话一轮之后，
    // 模拟后端进度已经变了（真实场景下是这轮对话本身触发的 completeQuest）。
    let questsResponse = initialQuests;
    let progressResponse = initialProgress;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/api/dialogue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ speakerId: "npc-barista", text: "Hi there!", timestamp: Date.now() }),
        });
      }
      if (u.includes("/api/quests")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => questsResponse });
      }
      if (u.includes("/api/progress")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => progressResponse });
      }
      return Promise.reject(new Error(`unexpected fetch url: ${u}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 1"));
    expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Not started");

    // 后端"已经"因为这轮对话而更新了（下一次 GET 会拿到新数据）
    questsResponse = updatedQuests;
    progressResponse = updatedProgress;

    // jsdom 没有 SpeechRecognition，VoiceDialogueInput 会走文字兜底表单
    const input = screen.getByLabelText("Type your reply");
    fireEvent.change(input, { target: { value: "Hi! I'm new here." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // 关键：没有点任何"刷新"/"重试"按钮，UI 应该自动反映新的等级/积分/任务状态
    await waitFor(() => expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 2"));
    expect(screen.getByTestId("player-status-points")).toHaveTextContent("25 pts");
    expect(screen.getByTestId("quest-status-quest-greet-barista")).toHaveTextContent("Completed");
  });
});
