# The website in three languages

Since 6 November 2026 the public website (src/site/) can be read in
English, simplified Chinese and Ukrainian. The app itself (/field, /atlas)
is English only. This page says how it works and what to do when a page
changes.

## For a visitor

- The language switch is in the menu bar (a word that is a select), in the
  phone menu, and in the footer.
- The website opens in the language asked for in the address (`?lang=zh`,
  `?lang=uk`, `?lang=en`; a tag such as `?lang=zh-CN` or `?lang=uk-UA` works
  too), else the one this browser chose before, else the browser's own first
  language the website has, else English. The choice is remembered in the
  browser (localStorage, `chernozem.site.lang`); using the switch drops a
  `?lang=` from the address, so a reload keeps the switch's choice.
- Numbers follow the language (1,780,400 in English and Chinese, 1 780 400
  in Ukrainian; decimals 0.40 in English and Chinese, 0,40 in Ukrainian,
  through `formatInt` and `formatFixed` in src/site/content/site.js). The
  films are narrated in English; the page says so in the other languages.
- In Chinese the characters are set in Noto Sans SC (loaded only then); in
  Ukrainian the whole website is set in Inter, because Schibsted Grotesk has
  no Cyrillic.

## How it works

- `src/site/i18n/i18n.js`: the `LanguageProvider` around the website
  (SiteShell.jsx), `useT(namespace)` and `useLanguage()`.
- `src/site/i18n/language.js`: the plain functions (which language, how a
  sentence is looked up).
- `src/site/i18n/zh/*.js` and `src/site/i18n/uk/*.js`: the dictionaries, one
  file per part of the website (`home`, `story`, `method`, `labs`,
  `contact`, `demo`, `register`, `signin`, `owner`, `globe`, `ranking`) and
  `common` for the frame and what several pages say. Every file in the folder
  is merged automatically; the key is the English sentence exactly as the
  page writes it, the value its translation (or a function of the vars, for
  Ukrainian plurals). An English visitor never downloads them.
- A page writes `const t = useT("story")` (one namespace per file) and shows
  every sentence through `t("The English sentence.")`; holes are
  `t("{n} fields", { n })`, and a hole may hold an element. A sentence with
  no entry stays English: nothing ever goes missing.
- `src/site/i18n/i18n.test.js` keeps it honest. It fails when a page shows
  English outside `t()`, when a sentence a page asks for is missing from
  either dictionary, when a dictionary holds a sentence no page has any
  more, when the two dictionaries differ in their keys, or when an entry
  breaks the language's rules (Chinese punctuation, the Ukrainian apostrophe
  ʼ, no Russian letters). Names (Chernozem, Field, Atlas, NDVI, Sentinel-2
  and so on, `ALLOWED_WORDS` in the test) may stay as they are.

## When a page changes

1. Write the English in the page through `t("...")` as the page already
   does. Run `npm test`.
2. The test names what is missing: add the sentence to
   `src/site/i18n/zh/<namespace>.js` and `src/site/i18n/uk/<namespace>.js`,
   translated. Use the glossary (docs/LANGUAGES-GLOSSARY.md) so the words
   stay the same across pages. Remove entries the test calls stale.
3. Run `npm test` again; `npm run build`.

The style the translations follow: a quiet, plain voice, no marketing words.
Chinese: simplified, 您 for the reader, Chinese punctuation, a space between
a Chinese character and a Latin word or number. Ukrainian: ʼ for the
apostrophe, « » for quotes, ви lowercase, imperatives on buttons, plurals by
function (1 поле, 2 поля, 5 полів).

## Adding a language

Add it to `LANGUAGES` in `src/site/i18n/language.js` (code, the page's lang
tag, the locale for numbers, its own name), a loader in `i18n.js`, a folder
of dictionaries with the same files as `zh/` and `uk/`, a font stack in
`src/site/site.css` if the face lacks its letters, and its rules to the
dictionary test.
