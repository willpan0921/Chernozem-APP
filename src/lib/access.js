// WHAT THIS FILE DOES
// Who the visitor is, worked out from the server's answer to
// GET /api/auth/status (read by src/components/atlas/AccessGate.jsx):
//
//   { required, signedIn, shared, account, mode, readOnly }
//
// There is no access code screen any more. The app always opens, and the
// server says which of four kinds of visitor this is ("mode"):
//
//   "demo"     anyone without an account, and an account holder who chose
//              "Open Field" or "Open Atlas" on the website's Demo page: the
//              public Ukraine demo, both products, READ-ONLY. They can look
//              at everything, switch views, move the Atlas weights, open
//              another saved area and pick the units (all in their own
//              browser only), and ask the AI a few questions; anything that
//              would change the demo opens the "This is the demo" dialog
//              instead (src/state/useDemoGuard.js).
//   "owner"    the owner, signed in on the hidden /owner page with the
//              Chernozem Google account (a Firebase account whose e-mail
//              the server lists in OWNER_EMAILS): the same demo data, and
//              every change is saved. The server's answer then also names
//              that Google account: account { uid, email, name, ...,
//              owner: true }. The owner is never an "account" visitor
//              (ownerOf below reads that account).
//   "open"     one's own computer (no owner sign-in needed there): the
//              same powers as the owner.
//   "account"  registered on the website: one product (Field or Atlas),
//              their own private workspace, their name in the sidebar.
//   null       not known (the server could not be reached): the app opens
//              anyway, read-only, and the gate asks again later.
//
// An older server, from before "mode", is read the old way: an account is
// an account (one marked owner: true is the owner), no sign-in needed is
// "open", the old owner cookie is the owner, and no cookie when one is
// needed is the demo.
//
// THE RULES. Each takes the server's answer, or what useAccess() gives
// ({ mode, readOnly, shared, account, owner, profile, ownHome }), which
// carries the same "mode" and "account" (and the owner's Google account as
// "owner").
//   modeOf(status)               "demo" | "owner" | "open" | "account" | null
//   isReadOnly(status)           true for the demo, and while not known
//   isShared(status)             true when this is the shared demo data
//                                (demo, owner, open); false for an account;
//                                null when not known
//   accountOf(status)            the registered account ({ uid, email, name,
//                                product, profileComplete }), only when the
//                                visitor IS that account; null otherwise
//                                (the demo never has one, even for an
//                                account holder looking at it; nor the owner)
//   ownerOf(status)              the owner's own Google account ({ uid,
//                                email, name }) while the owner is signed
//                                in; null for everyone else, and for an
//                                older server's owner (it does not say)
//   productFor(status)           "field" | "atlas" for an account with that
//                                product; null when both products are open
//   restrictsProduct(status)     true when src/components/ProductGuard.jsx
//                                keeps the visitor on one product (an
//                                account; never the demo)
//   mayUseProduct(status, id)    true when the visitor may open that
//                                product ("field" | "atlas"): everyone but
//                                an account of the other product. The data
//                                layers (src/state/AtlasData.jsx,
//                                FieldData.jsx) ask the server nothing
//                                otherwise
//   canSwitchProduct(status)     true when the sidebar shows the Field /
//                                Atlas switch (demo, owner, open; an account
//                                only before it has a product)
//   canSignOut(status)           true when the sidebar shows "Sign out": the
//                                owner and accounts, never the demo
//   showDemoNote(status)         true for the sidebar's "Demo · Ukraine,
//                                read-only" box with "Register"
//   canSeeMessages(status)       true for Atlas Settings' "Messages from the
//                                website" card (owner and open only)
//   seesSetup(status)            true when the app may show how the server
//                                is set up (the .env lines, "Connect
//                                Claude", "Get a key"): owner and open only.
//                                Everyone else reads one plain line instead,
//                                such as AI_UNAVAILABLE_TEXT: "The assistant
//                                is not available right now."
//   homePathFor(status)          where the visitor's app starts: "/atlas"
//                                for an Atlas account, else "/field"
//   needsProfile(status)         true when an account must finish its
//                                profile on the website first
//   registerPathFor(status)      the website page that finishes the profile,
//                                with the product already chosen
//   demoRegisterPath(productId)  where the demo's "Register" goes:
//                                "/register?product=field" from Field,
//                                "/register?product=atlas" from the Atlas
//   backToWebsitePath()          where "Back to the website" goes: "/"
//   identityOf(status)           "demo:", "owner:<uid>", "account:<uid>"...
//                                or null when not known: the gate starts
//                                the app again when this changes
//   sidebarNoteFor(note, status) the sidebar's small note { kind, text }, or
//                                null (words in src/config/navigation.js);
//                                the owner's also says which Google account
//                                is signed in: "You are editing the demo
//                                (signed in as chernozem.app@gmail.com)"
//   accountLabel(account)        the sidebar's account row: { initials, label }
//   isDemoRefusal(error)         true for the server's (or the app's own)
//                                "demo_read_only" refusal
//
// THE OWNER'S MESSAGES CARD (Atlas Settings, "Messages from the website",
// shown only when canSeeMessages): whether the website's contact messages
// reach the owner's inbox.
//   contactMailNote(mail)        the one line at the top of the card when
//                                contact e-mail is off ("Contact e-mail is
//                                off: add GMAIL_APP_PASSWORD on Render
//                                (docs/DEPLOY.md)."), else null. mail is
//                                GET /api/status's mail { configured,
//                                transport, to } (server/mail.js mailStatus)
//   messageMailLine(mail, opts)  how one message's e-mail went, in words:
//                                { tone: "sent" | "waiting" | "failed",
//                                text, detail }, e.g. { tone: "sent", text:
//                                "E-mailed to chernozem.app@gmail.com" }.
//                                mail is the message's own "mail" from GET
//                                /api/messages (server/messages.js); opts
//                                { to, configured } come from the status
//
// The words themselves are in src/config/navigation.js (privacyNote,
// demoWords); the messages card's are here, next to their rules.
//
// WHO EDITS IT
// Nobody, normally. The server side is server/auth.js (and, for the
// messages card, server/messages.js and server/mail.js).

const PRODUCTS = ["field", "atlas"];
export const MODES = ["demo", "owner", "open", "account"];

// The code the server (and the app itself) gives a change refused because
// this is the demo.
export const DEMO_READ_ONLY_CODE = "demo_read_only";

function isObject(value) {
  return Boolean(value) && typeof value === "object";
}

// The account object the answer carries, whatever the mode.
function rawAccount(status) {
  if (!isObject(status)) return null;
  return isObject(status.account) ? status.account : null;
}

export function modeOf(status) {
  if (!isObject(status)) return null;
  if (MODES.includes(status.mode)) return status.mode;
  // An older server, from before "mode".
  const account = rawAccount(status);
  if (account) return account.owner === true ? "owner" : "account";
  if (status.required === false) return "open";
  if (status.required === true) return status.signedIn === true ? "owner" : "demo";
  return null;
}

export function isReadOnly(status) {
  if (isObject(status) && typeof status.readOnly === "boolean") return status.readOnly;
  const mode = modeOf(status);
  // Not known: nothing is changed until the server has said who this is.
  return mode === null || mode === "demo";
}

export function accountOf(status) {
  return modeOf(status) === "account" ? rawAccount(status) : null;
}

export function ownerOf(status) {
  if (modeOf(status) !== "owner") return null;
  // useAccess() carries it as "owner"; the server's answer as "account".
  if (isObject(status.owner)) return status.owner;
  return rawAccount(status);
}

// The owner's e-mail, tidied, or "" when the server did not say.
function ownerEmail(status) {
  const email = ownerOf(status)?.email;
  return typeof email === "string" ? email.trim() : "";
}

export function isShared(status) {
  const mode = modeOf(status);
  if (mode === null) return null;
  return mode !== "account";
}

export function productFor(status) {
  const account = accountOf(status);
  if (!account) return null;
  return PRODUCTS.includes(account.product) ? account.product : null;
}

export function restrictsProduct(status) {
  return productFor(status) !== null;
}

export function mayUseProduct(status, productId) {
  return !restrictsProduct(status) || productFor(status) === productId;
}

export function canSwitchProduct(status) {
  return productFor(status) === null;
}

export function canSignOut(status) {
  const mode = modeOf(status);
  return mode === "owner" || mode === "account";
}

export function showDemoNote(status) {
  return modeOf(status) === "demo";
}

export function canSeeMessages(status) {
  const mode = modeOf(status);
  return mode === "owner" || mode === "open";
}

export function seesSetup(status) {
  const mode = modeOf(status);
  return mode === "owner" || mode === "open";
}

// What everyone but the owner reads while the AI has no key (the chat and
// both Settings pages; the server's own words for them too, with the error
// code "ai_not_configured").
export const AI_UNAVAILABLE_TEXT = "The assistant is not available right now.";

export function homePathFor(status) {
  return productFor(status) === "atlas" ? "/atlas" : "/field";
}

export function needsProfile(status) {
  const account = accountOf(status);
  if (!account) return false;
  return account.profileComplete === false || productFor(status) === null;
}

export function registerPathFor(status) {
  const product = productFor(status);
  return product ? `/register?product=${product}` : "/register";
}

export function demoRegisterPath(productId) {
  return PRODUCTS.includes(productId) ? `/register?product=${productId}` : "/register";
}

export function backToWebsitePath() {
  return "/";
}

export function identityOf(status) {
  const mode = modeOf(status);
  if (mode === null) return null;
  const uid = (accountOf(status) || ownerOf(status))?.uid;
  return `${mode}:${typeof uid === "string" ? uid : ""}`;
}

// note: the product's privacyNote from navigation.js, e.g. for Field
// { private, account, owner, demo }. The demo's words go inside the
// sidebar's demo box (kind "demo"); while the visitor is not known there is
// no note rather than a wrong one. The owner's note names the Google
// account signed in, when the server says it.
export function sidebarNoteFor(note, status) {
  if (!note) return null;
  const mode = modeOf(status);
  if (mode === "demo") return note.demo ? { kind: "demo", text: note.demo } : null;
  if (mode === "owner") {
    if (!note.owner) return null;
    const email = ownerEmail(status);
    return { kind: "owner", text: email ? `${note.owner} (signed in as ${email})` : note.owner };
  }
  if (mode === "open") return note.private ? { kind: "private", text: note.private } : null;
  if (mode === "account") return note.account ? { kind: "account", text: note.account } : null;
  return null;
}

// "William Pan" -> { initials: "WP", label: "William Pan" }; one word
// "William" -> "WI"; no name -> the e-mail's first letter, else "?".
export function accountLabel(account) {
  const name = typeof account?.name === "string" ? account.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof account?.email === "string" ? account.email.trim() : "";
  if (name) {
    const words = name.split(" ");
    const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
    return { initials: initials.toUpperCase(), label: name };
  }
  if (email) return { initials: email[0].toUpperCase(), label: email };
  return { initials: "?", label: "Account" };
}

export function isDemoRefusal(error) {
  return isObject(error) && error.code === DEMO_READ_ONLY_CODE;
}

// ---------- The owner's messages card: does the e-mail go out? ----------

// Where the website's messages are e-mailed when the server does not say
// (server/mail.js DEFAULT_MAIL_TO).
export const DEFAULT_MAIL_TO = "chernozem.app@gmail.com";
// How many times the server tries to e-mail one message before it stops
// (server/messages.js MAIL_RETRY.maxAttempts) and how often it tries again
// (MAIL_RETRY.everyMs).
export const MAIL_MAX_TRIES = 8;
const RETRY_WORDS = "every 10 minutes";

export const CONTACT_MAIL_OFF_TEXT = "Contact e-mail is off: add GMAIL_APP_PASSWORD on Render (docs/DEPLOY.md).";

export function contactMailNote(mail) {
  return isObject(mail) && mail.configured === false ? CONTACT_MAIL_OFF_TEXT : null;
}

const tries = (n) => (n === 1 ? "1 try" : `${n} tries`);

// mail: { status, attempts, at, transport, error } as the server keeps it
// (status "pending" | "sent" | "failed" | "off", and "held" when the day's
// e-mails are used up). opts.to: where e-mails go (the status's mail.to);
// opts.configured: whether contact e-mail is on now (false: off; undefined:
// the server did not say).
export function messageMailLine(mail, { to, configured } = {}) {
  const inbox = typeof to === "string" && to.trim() ? to.trim() : DEFAULT_MAIL_TO;
  const status = isObject(mail) && typeof mail.status === "string" ? mail.status : "pending";
  const attempts = isObject(mail) && Number.isInteger(mail.attempts) && mail.attempts > 0 ? mail.attempts : 0;
  const error = isObject(mail) && typeof mail.error === "string" ? mail.error.replace(/\s+/g, " ").trim() : "";
  const detail = error || null;
  if (status === "sent") return { tone: "sent", text: `E-mailed to ${inbox}`, detail: null };
  if (status === "failed") {
    if (attempts >= MAIL_MAX_TRIES) return { tone: "failed", text: `E-mail failed after ${tries(attempts)}, so it is only kept here`, detail };
    return { tone: "failed", text: attempts ? `E-mail failed, trying again (${tries(attempts)})` : "E-mail failed, trying again", detail };
  }
  if (status === "held") return { tone: "waiting", text: "Not e-mailed yet: the day's e-mails are used up, so it goes out tomorrow", detail: null };
  if (status === "sending") return { tone: "waiting", text: "Being e-mailed now", detail: null };
  // "off" (no e-mail set up when it came), "pending", or a word the app
  // does not know yet.
  if (configured === false || (status === "off" && configured !== true)) return { tone: "waiting", text: "Not e-mailed yet: contact e-mail is off", detail: null };
  return { tone: "waiting", text: `Not e-mailed yet: it is tried again ${RETRY_WORDS}`, detail: null };
}
