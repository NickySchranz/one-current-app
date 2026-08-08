import { useAppStore } from "@/stores/app-store";
import { es } from "./es";

export type Lang = "en" | "es";

/**
 * Translate one piece of app copy. Keys are the English source strings, so
 * English needs no dictionary and a missing translation falls back to English.
 * `{name}` placeholders are filled from `vars` — user-written text always
 * passes through vars untouched, never through the dictionary.
 */
export function translate(
  lang: Lang,
  text: string,
  vars?: Record<string, string | number>,
): string {
  let out = lang === "es" ? (es[text] ?? text) : text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

/** The app's translator, bound to the language chosen in settings. */
export function useT(): (text: string, vars?: Record<string, string | number>) => string {
  const lang = useAppStore((s) => s.language);
  return (text, vars) => translate(lang, text, vars);
}
