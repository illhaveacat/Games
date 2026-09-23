import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VoiceDialogueInput } from "./VoiceDialogueInput";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VoiceDialogueInput — SpeechRecognition unavailable (degraded) branch", () => {
  it("renders a text-input fallback instead of the mic button, without throwing or leaving a blank page", () => {
    // jsdom 默认没有 SpeechRecognition/webkitSpeechRecognition，天然代表不支持语音的浏览器。
    expect(() => render(<VoiceDialogueInput npcId="npc-mira" onReply={() => {}} />)).not.toThrow();

    expect(screen.getByTestId("voice-input-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-input-mic")).not.toBeInTheDocument();
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("submits the typed text to /api/dialogue and reports the NPC reply via onReply", async () => {
    const mockReply = { speakerId: "npc-mira", text: "Hi there!", timestamp: 1 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockReply }),
    );
    const onReply = vi.fn();

    render(<VoiceDialogueInput npcId="npc-mira" onReply={onReply} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello there" } });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onReply).toHaveBeenCalledWith(mockReply));
  });
});

describe("VoiceDialogueInput — SpeechRecognition available branch", () => {
  class FakeSpeechRecognition {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn(() => {
      this.onresult?.({ results: [{ 0: { transcript: "hi mira" } }] });
    });
    stop = vi.fn();
  }

  it("shows the mic button (not the fallback form) and drives a full voice -> reply round trip", async () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
    const mockReply = { speakerId: "npc-mira", text: "Hi there!", timestamp: 2 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockReply }),
    );
    const onReply = vi.fn();

    render(<VoiceDialogueInput npcId="npc-mira" onReply={onReply} />);

    expect(screen.getByTestId("voice-input-mic")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-input-fallback")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onReply).toHaveBeenCalledWith(mockReply));
  });
});
