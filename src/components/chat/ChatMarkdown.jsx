// WHAT THIS FILE DOES
// Draws one AI answer: paragraphs, headings, bullet and numbered lists,
// small tables, and bold / italic / code words. The text is split into
// those pieces by src/lib/chat/markdown.js; this file only draws them
// (plain React elements, never raw HTML).
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// text      - the answer text (may still be growing while it streams)
// streaming - true while more text is coming: a blinking caret is shown at the end

import { Fragment, useMemo } from "react";
import { parseMarkdown } from "../../lib/chat/markdown.js";

function Inline({ parts }) {
  return parts.map((part, index) => {
    if (part.type === "strong") return <strong key={index}>{part.text}</strong>;
    if (part.type === "em") return <em key={index}>{part.text}</em>;
    if (part.type === "code") return <code key={index}>{part.text}</code>;
    return <Fragment key={index}>{part.text}</Fragment>;
  });
}

function Block({ block }) {
  switch (block.type) {
    case "h":
      return (
        <p className="chat-md-heading">
          <Inline parts={block.inline} />
        </p>
      );
    case "ul":
      return (
        <ul className="chat-md-list">
          {block.items.map((item, index) => (
            <li key={index} className={block.depths?.[index] ? "is-sub" : undefined}>
              <Inline parts={item} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="chat-md-list" start={block.start}>
          {block.items.map((item, index) => (
            <li key={index} className={block.depths?.[index] ? "is-sub" : undefined}>
              <Inline parts={item} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="table-wrap chat-md-table">
          <table className="table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>
                    <Inline parts={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <Inline parts={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="chat-md-rule" />;
    default:
      return (
        <p>
          <Inline parts={block.inline} />
        </p>
      );
  }
}

export default function ChatMarkdown({ text, streaming = false }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={streaming ? "chat-md is-streaming" : "chat-md"}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
