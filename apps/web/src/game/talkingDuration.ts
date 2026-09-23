const MIN_TALKING_MS = 1200;
const MAX_TALKING_MS = 6000;
const MS_PER_CHAR = 45;

/**
 * 按文本长度粗略估算"说话"动画应持续多久，夹在 [MIN_TALKING_MS, MAX_TALKING_MS] 之间，
 * 避免极短回复一闪而过、极长回复一直播动画。
 */
export function estimateTalkingDurationMs(text: string): number {
  const estimated = text.trim().length * MS_PER_CHAR;
  return Math.min(MAX_TALKING_MS, Math.max(MIN_TALKING_MS, estimated));
}
