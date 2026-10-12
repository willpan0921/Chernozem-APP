// WHAT THIS FILE DOES
// Draws the structured box under an AI answer. The data (src/data/chats.js)
// says which kind of box with "card.type":
//   plan    - white outlined box: green all-caps title, rows of icon + text
//             (icons coloured by icons.jsx, or by the row's own "tone"),
//             a footer line and an "Open the plan" link
//   whatif  - grey box: title with a sliders icon, white rows of
//             "label | badge value", a footer line
//   table   - white box: the draft budget table with a bold Total row
//   actions - a row of small buttons, like "Show on the Atlas"
//
// WHO EDITS IT
// Danny. To add a new kind of card, add a case to the switch at the bottom
// and describe its shape in the header of src/data/chats.js.
//
// WHAT IT RECEIVES
// card - one card object from the data

import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { Badge, Button } from "../ui/index.js";
import ChatIcon from "./icons.jsx";

// "PLAN UPDATED · FIELD 7": icon rows, footer and link.
function PlanCard({ card }) {
  return (
    <div className="chat-card chat-card-plan">
      <div className="chat-card-title">
        <span className="eyebrow">{card.title}</span>
      </div>
      <ul className="chat-plan-items">
        {card.items.map((item, index) => (
          <li key={index} className="chat-plan-item">
            <ChatIcon name={item.icon} tone={item.tone} size={14} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      {(card.footer || card.link) && (
        <div className="chat-card-footer">
          {card.footer}
          {card.link && (
            <>
              <br />
              <Link to={card.link.to}>{card.link.label}</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// "WHAT IF · ...": rows of label, badge and value on a grey panel.
function WhatIfCard({ card }) {
  return (
    <div className="chat-card chat-card-whatif">
      <div className="chat-card-title">
        <SlidersHorizontal size={14} className="chat-card-title-icon" />
        <span className="eyebrow">{card.title}</span>
      </div>
      <div className="chat-whatif-rows">
        {card.rows.map((row, index) => (
          <div key={index} className="chat-whatif-row">
            <span className="chat-whatif-label">{row.label}</span>
            <span className="chat-whatif-value">
              {row.badge && <Badge tone={row.badge.tone}>{row.badge.text}</Badge>}
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {card.footer && <p className="chat-card-footer">{card.footer}</p>}
    </div>
  );
}

// One row of the draft plan table: [rank, name, budget, land]. The Total
// row has "" where the rank would be and is drawn in bold.
function TableRow({ row, isTotal }) {
  return (
    <tr className={isTotal ? "chat-table-total" : undefined}>
      <td>
        {row[0] && <span className="chat-table-rank">{row[0]}</span>}
        <span className="chat-table-name">{row[1]}</span>
      </td>
      <td className="num">{row[2]}</td>
      <td className="num">{row[3]}</td>
    </tr>
  );
}

// "DRAFT PLAN · SPRING 2027": a small table with a bold Total row. Budget
// and land use the number font.
function TableCard({ card }) {
  return (
    <div className="chat-card chat-card-table">
      <div className="chat-card-title">
        <span className="eyebrow">{card.title}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{card.columns[0]}</th>
              <th className="num">{card.columns[1]}</th>
              <th className="num">{card.columns[2]}</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, index) => (
              <TableRow key={index} row={row} />
            ))}
            {card.total && <TableRow row={card.total} isTotal />}
          </tbody>
        </table>
      </div>
      {card.footer && <p className="chat-card-footer">{card.footer}</p>}
    </div>
  );
}

// A row of small buttons. A button with "to" is a link; one without does
// nothing yet.
function ActionsCard({ card }) {
  return (
    <div className="chat-card-actions">
      {card.buttons.map((button, index) => (
        <Button
          key={index}
          size="sm"
          icon={<ChatIcon name={button.icon} size={13} />}
          to={button.to}
          title={button.to ? undefined : "Not connected yet"}
        >
          {button.label}
        </Button>
      ))}
    </div>
  );
}

export default function ChatCard({ card }) {
  if (!card) return null;
  switch (card.type) {
    case "plan":
      return <PlanCard card={card} />;
    case "whatif":
      return <WhatIfCard card={card} />;
    case "table":
      return <TableCard card={card} />;
    case "actions":
      return <ActionsCard card={card} />;
    default:
      // An unknown type shows its name so the mistake is easy to find.
      return <div className="chat-card muted small">Unknown card type: {String(card.type)}</div>;
  }
}
