// WHAT THIS FILE DOES
// The Chernozem logo: the map pin with layers of field, black soil and
// subsoil and an orange sun (public/chernozem-logo.png, transparent
// background). Used in the sidebar, on the access-code screen and as the
// AI's avatar in chats. The browser tab uses public/favicon-*.png
// (index.html).
//
// WHAT IT RECEIVES
//   size       height in px (the pin is taller than wide; default 26)
//   className  extra class names (optional)
//   label      text for screen readers; "" (default) when a name is
//              already next to it
//
// WHO EDITS IT
// Whoever changes the brand. Replace the PNG files in public/ to change
// the picture.

export const LOGO_SRC = "/chernozem-logo.png";

export default function Logo({ size = 26, className = "", label = "" }) {
  return (
    <img
      src={LOGO_SRC}
      width={size}
      height={size}
      className={["logo", className].filter(Boolean).join(" ")}
      alt={label}
      aria-hidden={label ? undefined : "true"}
      draggable="false"
    />
  );
}
