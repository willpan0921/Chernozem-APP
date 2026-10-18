// WHAT THIS FILE DOES
// The card shown in the chat when the AI has no key yet: three numbered
// steps to connect Claude (get a key, put it in .env, restart) and a
// "Check again" button that asks the server whether the key is there now.
// The words come from "aiSetup" in src/data/chats.js.
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// onCheck  - called when "Check again" is clicked
// checking - true while that check is running

import { KeyRound, RefreshCw } from "lucide-react";
import { Button } from "../ui/index.js";
import { aiSetup } from "../../data/chats.js";

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
