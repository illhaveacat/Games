import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTalkingIndicator } from "./useTalkingIndicator";

afterEach(() => {
  vi.useRealTimers();
});

describe("useTalkingIndicator", () => {
  it("starts talking immediately, then switches back to idle after the estimated duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ text, timestamp }) => useTalkingIndicator(text, timestamp), {
      initialProps: { text: "Hi!", timestamp: 1 },
    });

    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000); // 远超任何估算时长的上限
    });

    expect(result.current).toBe(false);
  });

  it("re-enters talking when a new dialogue (different timestamp) arrives after going idle", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ text, timestamp }) => useTalkingIndicator(text, timestamp), {
      initialProps: { text: "Hi!", timestamp: 1 },
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(false);

    rerender({ text: "Bye!", timestamp: 2 });
    expect(result.current).toBe(true);
  });

  it("does not restart the timer when re-rendered with the same timestamp", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ text, timestamp }) => useTalkingIndicator(text, timestamp), {
      initialProps: { text: "Hi!", timestamp: 1 },
    });

    act(() => {
      vi.advanceTimersByTime(1199); // 刚好还没到最短时长
    });
    rerender({ text: "Hi!", timestamp: 1 });
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe(false);
  });
});
