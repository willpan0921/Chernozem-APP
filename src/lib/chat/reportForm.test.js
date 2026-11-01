// WHAT THIS FILE DOES
// Checks on the Field overview's report form, "Tell us what happened"
// (TellUs in src/pages/field/OverviewPage.jsx, its look in
// OverviewPage.css), read from the source files (no browser needed). The
// report it sends becomes the first message of the AI chat
// (src/pages/field/AiPage.jsx), so it is checked here with the chat's
// wording:
//   - while it sends ("Sending…", then "Sent"), the form is locked: the
//     words are read-only and the kinds, the field menu, each photo's x,
//     Add photos and Send are turned off, so nothing typed, chosen or
//     removed after Send can look as if it went too (it would not be sent);
//   - the locked form still shows what is being sent: the words and the
//     chosen kind and field at full strength, the photos without their x;
//   - a send that ends after the farmer left the page (for another page,
//     or back to the website) changes nothing on screen and never opens
//     the AI page by itself; the report is still saved.
// Run with: npm test
//
// WHO EDITS IT
// Whoever changes how the report form sends; keep these checks true.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fieldPages = join(import.meta.dirname, "..", "..", "pages", "field");
const page = readFileSync(join(fieldPages, "OverviewPage.jsx"), "utf8");
const css = readFileSync(join(fieldPages, "OverviewPage.css"), "utf8");
// The form is the last part of the page file.
const tellUs = page.slice(page.indexOf("function TellUs("));

// The opening tag of the first <name ...> element whose tag holds marker,
// read up to its closing ">" (a ">" inside {...} or quotes does not count).
function openingTag(source, name, marker) {
  for (let start = source.indexOf(`<${name}`); start >= 0; start = source.indexOf(`<${name}`, start + 1)) {
    let depth = 0;
    let quote = null;
    for (let i = start + 1; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        const tag = source.slice(start, i + 1);
        if (tag.includes(marker)) return tag;
        break;
      }
    }
  }
  return null;
}

// The declarations of one CSS rule, by its exact selector (one that starts
// a rule, not the last line of a longer "a,\nb {" list).
function rule(selector) {
  for (let at = css.indexOf(`${selector} {`); at >= 0; at = css.indexOf(`${selector} {`, at + 1)) {
    const before = css.slice(0, at).trimEnd();
    if (before.endsWith("}") || before.endsWith("*/")) return css.slice(at, css.indexOf("}", at) + 1);
  }
  return null;
}

test("the report form looks for its parts where this test reads them", () => {
  assert.ok(tellUs.length > 0 && page.includes("function TellUs("), "TellUs is in OverviewPage.jsx");
  // "sending" covers both moments the form is locked: the server has it, and "Sent".
  assert.match(tellUs, /const sending = stage !== "";/);
});

test("while it sends, the words are read-only and every other control is turned off", () => {
  const locks = [
    ["textarea", "fo-tell-text", "readOnly={sending}", "the words box"],
    ["select", "fo-tell-field", "disabled={sending}", "the field menu"],
    ["button", "fo-kind is-active", "disabled={sending}", "each kind (Fire, Flood...)"],
    ["button", "fo-photo-remove", "disabled={sending}", "each photo's x"],
    ["Button", "fo-send", "disabled={sending}", "Send"],
  ];
  for (const [name, marker, lock, what] of locks) {
    const tag = openingTag(tellUs, name, marker);
    assert.ok(tag, `found ${what}`);
    assert.ok(tag.includes(lock), `${what} has ${lock}: ${tag}`);
  }
  const addPhotos = openingTag(tellUs, "Button", "<Camera");
  assert.ok(addPhotos, "found Add photos");
  assert.match(addPhotos, /disabled=\{[^}]*\bsending\b[^}]*\}/, "Add photos is off while it sends");
  // Not aria-busy: it could keep a screen reader from saying "Sending…"
  // and "Sent. The assistant is reading it…" (both inside the form).
  assert.doesNotMatch(openingTag(tellUs, "form", "fo-tell-form") || "", /aria-busy/);
  assert.match(tellUs, /className="fo-tell-sent" role="status"/, "the Sent line is announced");
});

test("a send that ends after the farmer left changes nothing and never opens the chat", () => {
  // The flag is set when the form appears (so React's development
  // double start does not leave it off) and cleared when the form goes,
  // together with the "Sent" timer.
  const effect = tellUs.slice(tellUs.indexOf("useEffect("), tellUs.indexOf("}, []);"));
  assert.match(effect, /onPage\.current = true;/);
  assert.match(effect, /return \(\) => \{[\s\S]*onPage\.current = false;[\s\S]*clearTimeout\(sentTimer\.current\);/);

  const submit = tellUs.slice(tellUs.indexOf("const submit = async"), tellUs.indexOf("const submit = async") + 2000);
  const order = ["await actions.report(", "if (!onPage.current) return;", 'setStage("sent")', "setTimeout(() => onSent(report)"].map((piece) => {
    const at = submit.indexOf(piece);
    assert.ok(at >= 0, `submit has ${piece}`);
    return at;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order, "after the save: first the page check, then Sent, then the chat");

  const failed = submit.slice(submit.indexOf("} catch (err) {"));
  assert.ok(failed.indexOf("if (!onPage.current) return;") >= 0 && failed.indexOf("if (!onPage.current) return;") < failed.indexOf("setError("), "a failure after leaving shows nothing either");
});

test("the locked form still shows what is being sent", () => {
  // Words at full strength on a quieter background, never greyed out.
  assert.match(rule(".fo-tell-text.textarea[readonly],\n.fo-tell-field.select:disabled") || "", /background-color: var\(--c-surface-2\);/);
  assert.match(rule(".fo-tell-field.select:disabled") || "", /opacity: 1;/, "the chosen field stays readable");
  assert.match(rule(".fo-kind.is-active:disabled") || "", /opacity: 1;/, "the chosen kind stays dark");
  assert.match(rule(".fo-kind:disabled:not(.is-active):hover") || "", /background: var\(--c-surface\);/, "a faded kind does not light up");
  assert.match(rule(".fo-photo-remove:disabled") || "", /display: none;/, "no x on the photos being sent");
});
