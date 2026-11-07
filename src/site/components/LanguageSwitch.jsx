// WHAT THIS FILE DOES
// The website's language switch, in two looks:
//   variant="select"   one word, the current language's own name, that is
//                      a plain <select> of the three (the menu bar on a
//                      wide screen);
//   variant="buttons"  the three names in a row, the current one
//                      underlined (the phone menu's sheet, the footer).
// Each name is written in its own language and marked so (lang=), so the
// Chinese one is drawn with a Chinese face even on the English page.
// Choosing one shows that name as chosen at once (the switch is marked busy
// while the dictionary downloads), then switches the whole website, which
// is remembered by this browser; if the download fails, the switch goes
// back to the language still shown (src/site/i18n/i18n.js).
//
// WHO EDITS IT
// Whoever changes how the language is chosen. The languages themselves
// are listed in src/site/i18n/i18n.js.

import { LANGUAGES, useLanguage, useT } from "../i18n/i18n.js";

export default function LanguageSwitch({ variant = "select", className = "" }) {
  const { lang, pending, setLang } = useLanguage();
  const t = useT("common");
  // The one asked for shows as chosen while its dictionary downloads.
  const shown = pending ?? lang;
  const busy = pending ? true : undefined;
  if (variant === "buttons") {
    return (
      <div className={`lang-buttons ${className}`.trim()} role="group" aria-label={t("Language")} aria-busy={busy}>
        {LANGUAGES.map((language) => (
          <button
            key={language.code}
            type="button"
            lang={language.html}
            className={`link lang-button${language.code === shown ? " is-current" : ""}`}
            aria-pressed={language.code === shown}
            onClick={() => setLang(language.code)}
          >
            {language.name}
          </button>
        ))}
      </div>
    );
  }
  return (
    <select className={`lang-select ${className}`.trim()} aria-label={t("Language")} aria-busy={busy} value={shown} onChange={(event) => setLang(event.target.value)}>
      {LANGUAGES.map((language) => (
        <option key={language.code} value={language.code} lang={language.html}>
          {language.name}
        </option>
      ))}
    </select>
  );
}
