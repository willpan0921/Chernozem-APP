// WHAT THIS FILE DOES
// What the chat shows when the AI has no key yet. Two kinds, by who is
// looking (src/lib/access.js seesSetup):
//
//   <ChatSetupCard />    the owner, and one's own computer: three numbered
//                        steps to connect Claude (get a key, put it in .env,
//                        restart) and a "Check again" button that asks the
//                        server whether the key is there now. The words come
//                        from "aiSetup" in src/data/chats.js.
//   <ChatUnavailable />  everyone else (the demo's visitors, registered
//                        accounts): one plain line, "The assistant is not
//                        available right now." (the server says the same:
//                        error code "ai_not_configured"), and no setup steps,
//                        which would mean nothing to them.
//
// WHO EDITS IT
// Danny.
//
// WHAT THEY RECEIVE
// ChatSetupCard
//   onCheck  - called when "Check again" is clicked
//   checking - true while that check is running
// ChatUnavailable
//   nothing

import { Info, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "../ui/index.js";
import { aiSetup } from "../../data/chats.js";
// The visitor's line, as the server words it for them too.
import { AI_UNAVAILABLE_TEXT } from "../../lib/access.js";

export default function ChatSetupCard({ onCheck, checking }) {
  return (
    <section className="chat-setup" aria-label={aiSetup.title} data-testid="ai-setup">
      <div className="chat-setup-head">
        <span className="chat-setup-icon">
          <KeyRound size={16} />
        </span>
        <h2>{aiSetup.title}</h2>
      </div>
      <ol className="chat-setup-steps">
        {aiSetup.steps.map((step, index) => (
          <li key={index}>
            <span className="chat-setup-num">{index + 1}</span>
            <span>
              {step.text}{" "}
              {step.link && (
                <a href={step.link.href} target="_blank" rel="noreferrer">
                  {step.link.label}
                </a>
              )}
              {step.code && <code>{step.code}</code>}
            </span>
          </li>
        ))}
      </ol>
      <div>
        <Button size="sm" icon={<RefreshCw size={13} className={checking ? "chat-spin" : undefined} />} onClick={onCheck} disabled={checking}>
          {aiSetup.check}
        </Button>
      </div>
    </section>
  );
}

export function ChatUnavailable() {
  return (
    <section className="chat-setup chat-unavailable" role="status" data-testid="ai-unavailable">
      <p className="chat-unavailable-text">
        <Info size={16} aria-hidden="true" />
        {AI_UNAVAILABLE_TEXT}
      </p>
    </section>
  );
}
