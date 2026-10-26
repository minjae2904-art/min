// Language names shown in the language control. Endonyms never follow the UI language (a Thai reader looking for
// "ไทย" in an English UI must still find it), so they live here instead of in a dictionary.
import type { Lang } from "./core";

export const LANG_NATIVE: Record<Lang, string> = {
  th: "ไทย", // i18n-allow: endonym, shown in every UI language
  en: "English",
};
// Bilingual on purpose: whoever opens Settings in the wrong language can still find the control.
export const LANG_CONTROL_LABEL = "ภาษา / Language"; // i18n-allow: bilingual label of the language control
