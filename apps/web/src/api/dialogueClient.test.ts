import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDialogueReply } from "./dialogueClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDialogueReply", () => {
  it("POSTs { npcId, playerText } to /api/dialogue and returns the parsed DialogueResponse", async () => {
    const mockReply = { speakerId: "npc-mira", text: "Hi there!", timestamp: 123 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReply,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDialogueReply("npc-mira", "hello");

    expect(result).toEqual(mockReply);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/dialogue");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npcId: "npc-mira", playerText: "hello" }),
    });
  });

  it("throws when the server responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    await expect(fetchDialogueReply("npc-mira", "hello")).rejects.toThrow("500");
  });
});
