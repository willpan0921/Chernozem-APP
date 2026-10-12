// WHAT THIS FILE DOES
// A button. Give it "to" and it becomes a link to another page that looks
// the same.
//
// WHAT IT RECEIVES
// variant  - "primary" (green), "ink" (black), "secondary" (white with a
//            border), "ghost" (green text only) or "danger" (red text).
//            Default is "secondary".
// size     - "sm" or "lg" (optional)
// icon     - a Lucide icon element to show before the text (optional)
// to       - a page path; makes the button a link (optional)
// block    - true makes it full width
// Anything else (onClick, disabled, type...) is passed on to the button.

import { Link } from "react-router-dom";

export default function Button({
  variant = "secondary",
  size,
  icon,
  to,
  block,
  className = "",
  children,
  ...rest
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size ? `btn-${size}` : "",
    block ? "btn-block" : "",
    !children ? "btn-icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
