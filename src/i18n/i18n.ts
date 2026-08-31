import { useAppStore } from "@/stores/app-store";
import { THEME_COPY } from "@/ui/theme-copy";
import { es } from "./es";
import { esCO } from "./es-co";

export type Lang = "en" | "es" | "es-CO";

const DICTIONARIES: Partial<Record<Lang, Record<string, string>>> = {
  es,
  "es-CO": esCO,
};

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
  let out = DICTIONARIES[lang]?.[text] ?? text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

/**
 * The app's translator, bound to the language chosen in settings. The active
 * theme may re-skin key terms (summit: thread→rope, burn→cut): the overlay
 * remaps the English KEY before dictionary lookup, so overlay values are
 * ordinary keys with their own translations. `translate()` itself stays
 * theme-neutral for non-UI callers.
 */
export function useT(): (text: string, vars?: Record<string, string | number>) => string {
  const lang = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const overlay = THEME_COPY[theme];
  return (text, vars) => translate(lang, overlay?.[text] ?? text, vars);
}
