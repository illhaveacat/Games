import { useEffect, useRef, useState } from "react";
import { estimateTalkingDurationMs } from "./talkingDuration";

/**
 * 每次 (text, timestamp) 变化（NPC 有新的一句话）时进入"说话"状态，
 * 按文本长度估算的时长后自动切回"待机"。
 */
export function useTalkingIndicator(text: string, timestamp: number): boolean {
  const [talking, setTalking] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTalking(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setTalking(false), estimateTalkingDurationMs(text));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // text 只在 timestamp 变化时才应视为"新的一句话"，两者一起作为依赖即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timestamp]);

  return talking;
}
