// WHAT THIS FILE DOES
// Turns the AI's answer text into simple building blocks the chat can draw:
// paragraphs, headings, bullet and numbered lists, small tables, and bold,
// italic or `code` words inside them. Claude writes answers in Markdown
// ("**bold**", "- a point"), and this keeps those marks from showing as
// stars and dashes.
//
// It never produces HTML, so nothing the AI writes can run in the page.
// It also copes with half-written text while an answer is still streaming
// (a "**" with no closing pair simply shows as it is).
//
// WHO EDITS IT
// Danny (with the chat components in src/components/chat). Tests are in
// markdown.test.js next to this file.
//
// HOW TO CALL IT
//   parseMarkdown("Hello **there**\n\n- one\n- two")
//   -> [ { type: "p", inline: [{ type: "text", text: "Hello " }, { type: "strong", text: "there" }] },
//        { type: "ul", items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]], depths: [0, 0] } ]
//   "depths" says, per item, whether it is a sub-point (1) or not (0).

// Bold, italic and code marks inside one line.
//   "**a**" or "__a__" -> strong, "*a*" or "_a_" -> em, "`a`" -> code
const INLINE = /(\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|`([^`\n]+?)`|\*([^*\s][^*\n]*?)\*|(?<![\w])_([^_\s][^_\n]*?)_(?![\w]))/g;

export function parseInline(text) {
  const parts = [];
  let last = 0;
  for (const match of String(text ?? "").matchAll(INLINE)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    if (match[2] !== undefined || match[3] !== undefined) parts.push({ type: "strong", text: match[2] ?? match[3] });
    else if (match[4] !== undefined) parts.push({ type: "code", text: match[4] });
    else parts.push({ type: "em", text: match[5] ?? match[6] });
    last = match.index + match[0].length;
  }
  if (last < String(text ?? "").length) parts.push({ type: "text", text: text.slice(last) });
  return mergeText(parts);
}

// Joins neighbouring plain-text pieces.
function mergeText(parts) {
  const out = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (part.type === "text" && prev?.type === "text") prev.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,4})\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

// "| a | b |" -> ["a", "b"]
function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// Splits the whole answer into blocks.
export function parseMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];

  const endParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", inline: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.trim()) {
      endParagraph();
      continue;
    }

    // A table: a "| a | b |" line followed by "|---|---|".
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      endParagraph();
      const header = tableCells(line).map(parseInline);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(tableCells(lines[i]).map(parseInline));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (RULE.test(line)) {
      endParagraph();
      blocks.push({ type: "hr" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({ type: "h", level: heading[1].length, inline: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      endParagraph();
      const indent = (bullet ? bullet[1] : numbered[1]).replace(/\t/g, "  ").length;
      const itemText = bullet ? bullet[2] : numbered[3];
      const prev = blocks[blocks.length - 1];
      // An indented item under a list item is a sub-point of that list.
      if (indent >= 2 && (prev?.type === "ul" || prev?.type === "ol") && prev.open) {
        prev.items.push(parseInline(itemText));
        prev.depths.push(1);
        continue;
      }
      const type = bullet ? "ul" : "ol";
      if (prev?.type === type && prev.open) {
        prev.items.push(parseInline(itemText));
        prev.depths.push(0);
      } else {
        const block = { type, items: [parseInline(itemText)], depths: [0], open: true };
        if (numbered) block.start = Number(numbered[2]);
        blocks.push(block);
      }
      continue;
    }

    // A line that follows a list item without a blank line, indented,
    // continues that item.
    const prev = blocks[blocks.length - 1];
    if (!paragraph.length && (prev?.type === "ul" || prev?.type === "ol") && prev.open && /^\s{2,}/.test(line)) {
      const items = prev.items;
      items[items.length - 1] = mergeText([...items[items.length - 1], { type: "text", text: " " }, ...parseInline(line.trim())]);
      continue;
    }

    paragraph.push(line);
  }
  endParagraph();

  // A blank line between list items keeps one list; anything else closes it.
  return joinLists(blocks).map(({ open, ...block }) => block);
}

// "- a\n\n- b" is still one list.
function joinLists(blocks) {
  const out = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if ((block.type === "ul" || block.type === "ol") && prev?.type === block.type) {
      prev.items.push(...block.items);
      prev.depths.push(...block.depths);
    }
    else out.push(block);
  }
  return out;
}

// The answer as plain text, without the Markdown marks (for "Copy").
export function plainText(text) {
  return parseMarkdown(text)
    .map((block) => {
      const flat = (inline) => inline.map((part) => part.text).join("");
      if (block.type === "p" || block.type === "h") return flat(block.inline);
      if (block.type === "ul") return block.items.map((item, n) => `${block.depths[n] ? "    – " : "• "}${flat(item)}`).join("\n");
      if (block.type === "ol") return block.items.map((item, n) => `${(block.start || 1) + n}. ${flat(item)}`).join("\n");
      if (block.type === "table") return [block.header, ...block.rows].map((row) => row.map(flat).join("\t")).join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}
