import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useQuestProgress } from "./useQuestProgress";

afterEach(() => {
  vi.unstubAllGlobals();
});

const quests = [
  {
    quest: { id: "q1", npcId: "npc-barista", title: "Q1", completionCriteria: "c", rewardXp: 10, rewardPoints: 5 },
    progress: { questId: "q1", status: "not_started" as const },
  },
];
const progress = { level: 1, xp: 0, points: 0, completedQuestIds: [], unlocks: [] };

function mockFetchOk() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const body = String(url).includes("/api/quests") ? quests : progress;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useQuestProgress", () => {
  it("starts in 'loading' status (not a flash of empty data) and moves to 'loaded' once the fetch resolves", async () => {
    mockFetchOk();
    const { result } = renderHook(() => useQuestProgress());

    expect(result.current.status).toBe("loading");
    expect(result.current.quests).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.quests).toEqual(quests);
    expect(result.current.playerProgress).toEqual(progress);
  });

  it("moves to 'error' status when the initial load fails, and recovers to 'loaded' when refresh() succeeds (retry)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useQuestProgress());
    await waitFor(() => expect(result.current.status).toBe("error"));

    // 模拟点"重试"：这次让 fetch 成功
    mockFetchOk();
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.quests).toEqual(quests);
  });

  it("after a successful load, a failed refresh flips status to 'error' but keeps the last known good data on screen", async () => {
    mockFetchOk();
    const { result } = renderHook(() => useQuestProgress());
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.status).toBe("error"));
    // 数据没有被清空/替换成占位值——上一次成功加载的结果还在
    expect(result.current.quests).toEqual(quests);
    expect(result.current.playerProgress).toEqual(progress);
  });

  it("refresh() re-fetches and reflects updated data without flipping back to 'loading' once already loaded", async () => {
    mockFetchOk();
    const { result } = renderHook(() => useQuestProgress());
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    const updatedProgress = { level: 2, xp: 100, points: 25, completedQuestIds: ["q1"], unlocks: ["npc-barista-extra-line"] };
    const updatedQuests = [{ ...quests[0], progress: { questId: "q1", status: "completed" as const } }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const body = String(url).includes("/api/quests") ? updatedQuests : updatedProgress;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }),
    );

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.playerProgress?.level).toBe(2));
    expect(result.current.status).toBe("loaded"); // 中途没有变回 loading，避免整版闪烁
    expect(result.current.quests[0].progress.status).toBe("completed");
  });
});
