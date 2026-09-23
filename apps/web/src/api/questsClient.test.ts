import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlayerProgress, fetchQuests } from "./questsClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchQuests", () => {
  it("GETs /api/quests and returns the parsed quest list", async () => {
    const mockQuests = [
      { quest: { id: "q1", npcId: "npc-1", title: "Q1", completionCriteria: "c", rewardXp: 10, rewardPoints: 5 }, progress: { questId: "q1", status: "not_started" } },
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockQuests });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchQuests();

    expect(result).toEqual(mockQuests);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/quests");
    expect(init).toBeUndefined();
  });

  it("throws when the server responds with a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    await expect(fetchQuests()).rejects.toThrow("500");
  });
});

describe("fetchPlayerProgress", () => {
  it("GETs /api/progress and returns the parsed player progress (incl. unlocks)", async () => {
    const mockProgress = { level: 2, xp: 100, points: 25, completedQuestIds: ["q1"], unlocks: ["npc-barista-extra-line"] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockProgress });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPlayerProgress();

    expect(result).toEqual(mockProgress);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/progress");
  });

  it("throws when the server responds with a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    await expect(fetchPlayerProgress()).rejects.toThrow("404");
  });
});
