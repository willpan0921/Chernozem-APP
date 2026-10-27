// WHAT THIS FILE DOES
// Catches a page that fails to show, so the visitor never gets a blank
// screen. Instead it says, with a Reload button:
//   "A new version of Chernozem is live"   the page's code is gone from the
//                                          server because a new version went
//                                          live while this tab was open
//                                          (src/lib/staleChunks.js; usually
//                                          the page has reloaded by itself
//                                          before anyone reads this)
//   "Something went wrong on this page"    any other error (the details go
//                                          to the browser's console)
// AppShell.jsx puts one around the page, so the sidebar stays and opening
// another page tries again; App.jsx puts one around the whole app.
//
// WHAT IT RECEIVES
//   children   what it protects
//   resetKey   when this changes (another page was opened), it tries again
//   full       true: fills the whole window (around the whole app)
//
// WHO EDITS IT
// Nobody, normally.

import { Component } from "react";
import { RotateCw } from "lucide-react";
import Button from "../components/ui/Button.jsx";
import { isMissingCodeError } from "../lib/staleChunks.js";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[chernozem] A page could not be shown:", error, info?.componentStack || "");
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const newVersion = isMissingCodeError(error);
    return (
      <div className={this.props.full ? "page-error is-full" : "page-error"}>
        <div className="page-error-card" role="alert">
          <h1 className="page-error-title">{newVersion ? "A new version of Chernozem is live" : "Something went wrong on this page"}</h1>
          <p className="page-error-text">
            {newVersion ? "Reload the page to use it." : "Reload the page to try again."} Everything saved is kept.
          </p>
          <Button variant="primary" icon={<RotateCw size={15} aria-hidden="true" />} onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
