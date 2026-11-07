// WHAT THIS FILE DOES
// The Ukrainian dictionary of the website, put together from every file in
// this folder: each file is one namespace (home.js is "home", common.js is
// "common"), keyed by the English sentence as the page writes it. A new
// file here is in the dictionary at once; nothing lists them.
//
// WHO EDITS IT
// Nobody, normally. The translations are in the files beside it.

const files = import.meta.glob(["./*.js", "!./index.js"], { eager: true, import: "default" });

const dictionary = {};
for (const [path, entries] of Object.entries(files)) {
  dictionary[path.replace(/^\.\//, "").replace(/\.js$/, "")] = entries;
}

export default dictionary;
