import { afterEach, describe, expect, it, vi } from "vitest";
import { getSpeechRecognitionConstructor, isSpeechRecognitionSupported } from "./speechRecognitionSupport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("speechRecognitionSupport", () => {
  it("reports unsupported when neither SpeechRecognition nor webkitSpeechRecognition exist (jsdom default)", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
    expect(getSpeechRecognitionConstructor()).toBeUndefined();
  });

  it("reports supported when window.SpeechRecognition is present", () => {
    class FakeSpeechRecognition {}
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);

    expect(isSpeechRecognitionSupported()).toBe(true);
    expect(getSpeechRecognitionConstructor()).toBe(FakeSpeechRecognition);
  });

  it("falls back to window.webkitSpeechRecognition when only the vendor-prefixed one is present", () => {
    class FakeWebkitSpeechRecognition {}
    vi.stubGlobal("webkitSpeechRecognition", FakeWebkitSpeechRecognition);

    expect(isSpeechRecognitionSupported()).toBe(true);
    expect(getSpeechRecognitionConstructor()).toBe(FakeWebkitSpeechRecognition);
  });
});
