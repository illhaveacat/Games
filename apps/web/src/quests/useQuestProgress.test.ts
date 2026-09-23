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

  it("ignores a stale in-flight response that resolves after a newer refresh's response already landed (out-of-order network replies)", async () => {
    mockFetchOk();
    const { result } = renderHook(() => useQuestProgress());
    await waitFor(() => expect(result.current.status).toBe("loaded"));

    // 手动控制两轮 fetch 的 resolve 时机：第一轮（旧）故意晚于第二轮（新）resolve，
    // 模拟对话推进很快、连续触发两次 refresh 时网络响应可能乱序到达的情况。
    let resolveStaleProgress!: (value: unknown) => void;
    let resolveStaleQuests!: (value: unknown) => void;
    const staleProgress = new Promise((resolve) => {
      resolveStaleProgress = resolve;
    });
    const staleQuests = new Promise((resolve) => {
      resolveStaleQuests = resolve;
    });

    const freshProgress = { level: 3, xp: 300, points: 90, completedQuestIds: ["q1"], unlocks: [] };
    const freshQuests = [{ ...quests[0], progress: { questId: "q1", status: "completed" as const } }];
    const staleProgressBody = { level: 2, xp: 100, points: 25, completedQuestIds: [], unlocks: [] };

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        call += 1;
        const isQuests = String(url).includes("/api/quests");
        if (call <= 2) {
          // 第一轮（旧）：先不 resolve，稍后手动放行
          return isQuests
            ? staleQuests.then(() => ({ ok: true, status: 200, json: async () => quests }))
            : staleProgress.then(() => ({ ok: true, status: 200, json: async () => staleProgressBody }));
        }
        // 第二轮（新）：立即 resolve，先落地
        return Promise.resolve({ ok: true, status: 200, json: async () => (isQuests ? freshQuests : freshProgress) });
      }),
    );

    act(() => result.current.refresh()); // 第一轮：发出去但先不 resolve
    act(() => result.current.refresh()); // 第二轮：立即 resolve，先落地

    await waitFor(() => expect(result.current.playerProgress?.level).toBe(3));
    expect(result.current.quests[0].progress.status).toBe("completed");

    // 现在放行第一轮（旧）的响应：不应该覆盖已经落地的新数据
    resolveStaleQuests(undefined);
    resolveStaleProgress(undefined);
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.playerProgress?.level).toBe(3); // 仍然是新数据，没被旧响应覆盖
    expect(result.current.quests[0].progress.status).toBe("completed");
  });
});
