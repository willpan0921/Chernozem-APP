// Tests for src/lib/lazyPage.js (a page's code fetched ahead of time) and
// the page list in src/lazyPages.js (which code each address needs, and
// that it agrees with the routes in src/App.jsx).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lazyPage, track } from "./lazyPage.js";
import { APP_PAGES, OLD_ADDRESSES, SITE_PAGES, codeFor } from "../lazyPages.js";

const tick = () => new Promise((done) => setTimeout(done, 0));

test("track() marks a promise the way React's use() reads it", async () => {
  const good = track(Promise.resolve(42));
  assert.equal(good.status, "pending");
  await tick();
  assert.equal(good.status, "fulfilled");
  assert.equal(good.value, 42);

  const bad = track(Promise.reject(new Error("gone")));
  await tick();
  assert.equal(bad.status, "rejected");
  assert.equal(bad.reason.message, "gone");

  const marked = Promise.resolve(1);
  marked.status = "fulfilled";
  marked.value = "kept";
  assert.equal(track(marked).value, "kept", "a promise already marked is left alone");
});

test("a page's code is fetched once, ahead of time, and the page then draws without waiting", async () => {
  let loads = 0;
  const Page = lazyPage(async () => {
    loads += 1;
    return { default: ({ name }) => createElement("h1", null, `Hello ${name}`) };
  });
  assert.equal(Page.loaded, false);
  const first = Page.preload();
  assert.equal(Page.preload(), first, "the same download is reused");
  await first;
  assert.equal(loads, 1);
  assert.equal(Page.loaded, true);
  assert.equal(first.status, "fulfilled");
  // With the code here, React draws the page in one go (no suspension).
  assert.equal(renderToStaticMarkup(createElement(Page, { name: "Field" })), "<h1>Hello Field</h1>");
  assert.equal(loads, 1, "drawing does not download again");
});

test("a fetch ahead of time that fails is forgotten; a page's own request that fails is kept for the error boundary", async () => {
  let attempts = 0;
  const Page = lazyPage(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline");
    return { default: () => createElement("p", null, "here") };
  });
  await Page.preload().catch(() => {});
  await tick();
  assert.equal(Page.loaded, false);
  const second = Page.preload();
  assert.equal(attempts, 2, "the next fetch downloads again");
  await second;
  assert.equal(Page.loaded, true);

  let failures = 0;
  const Broken = lazyPage(async () => {
    failures += 1;
    throw new Error("the file is gone");
  });
  // The page itself asked (a draw), so the failure stays: React's use()
  // then throws the reason, and the error boundary shows its message.
  assert.throws(() => renderToStaticMarkup(createElement(Broken)), /Suspense|suspend|not finish|gone/i);
  await tick();
  await tick();
  const kept = Broken.preload();
  assert.equal(failures, 1, "no second download once the page asked for it");
  assert.equal(kept.status, "rejected");
});

test("codeFor() names the website's frame and page, or the app's page, for every address", () => {
  assert.deepEqual(codeFor("/"), [codeFor("/story")[0], SITE_PAGES["/"]]);
  assert.equal(codeFor("/story/")[1], SITE_PAGES["/story"], "a trailing slash is ignored");
  assert.equal(codeFor("/method?x=1#gate")[1], SITE_PAGES["/method"], "so are a query and a hash");
  assert.equal(codeFor("/about")[1], SITE_PAGES["/"], "an old address needs the page it goes to");
  assert.equal(codeFor("/technology")[1], SITE_PAGES["/method"]);
  assert.equal(codeFor("/no-such-page").length, 2, "the frame and the not-found page");
  assert.notEqual(codeFor("/no-such-page")[1], SITE_PAGES["/"]);
  assert.deepEqual(codeFor("/field"), [APP_PAGES["/field"]]);
  assert.deepEqual(codeFor("/field/fields"), [APP_PAGES["/field/fields"]]);
  assert.deepEqual(codeFor("/field/old-name"), [APP_PAGES["/field"]], "an unknown Field address lands on the overview");
  assert.deepEqual(codeFor("/atlas/report"), [APP_PAGES["/atlas/report"]]);
  assert.deepEqual(codeFor("/atlas/x/y"), [APP_PAGES["/atlas"]]);
  assert.deepEqual(codeFor(""), codeFor("/"));
  assert.equal(codeFor("/fieldwork")[0], codeFor("/")[0], "an address that only starts like /field is a website address");
});

test("the page list agrees with the routes in src/App.jsx", () => {
  const app = readFileSync(join(import.meta.dirname, "..", "App.jsx"), "utf8");
  const routed = new Map([...app.matchAll(/<Route (?:index|path="([^"]+)") element=\{<(\w+) \/>\}/g)].map((m) => [m[1] || "/", m[2]]));
  const names = (pages) => new Map(Object.entries(pages).map(([path, Page]) => [path, Page]));
  const imported = new Set([...app.matchAll(/import \{([^}]+)\} from "\.\/lazyPages\.js"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())));
  for (const [path, Page] of [...names(SITE_PAGES), ...names(APP_PAGES)]) {
    const name = routed.get(path);
    assert.ok(name, `App.jsx routes ${path}`);
    assert.ok(imported.has(name), `App.jsx takes ${name} from lazyPages.js`);
    assert.equal(Page, (SITE_PAGES[path] || APP_PAGES[path]), `${path} is the same page in both`);
  }
  for (const [from, to] of Object.entries(OLD_ADDRESSES)) {
    assert.ok(app.includes(`path="${from}" element={<Navigate to="${to}`), `App.jsx sends ${from} to ${to}`);
  }
  assert.ok(app.includes('path="*" element={<NotFoundPage />}'), "an unknown website address shows the not-found page");
  assert.doesNotMatch(app, /\blazy\(/, "App.jsx no longer uses React's lazy()");
});
