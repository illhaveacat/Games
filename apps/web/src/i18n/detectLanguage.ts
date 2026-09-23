export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = "en";

function isSupported(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

/**
 * 首次进入时按浏览器语言列表挑初始界面语言：
 * 取每个候选语言的主子标签（"zh-CN" -> "zh"），第一个命中支持列表的即用；
 * 全部不支持时回退到英文。
 */
export function resolveInitialLanguage(browserLanguages: readonly string[]): SupportedLanguage {
  for (const raw of browserLanguages) {
    const base = raw.toLowerCase().split("-")[0];
    if (isSupported(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}
