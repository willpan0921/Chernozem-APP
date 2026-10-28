// WHAT THIS FILE DOES
// The Chernozem logo: the map pin with layers of field, black soil and
// subsoil and an orange sun (transparent background). Used in the sidebar,
// on the access-code screen, as the AI's avatar in chats and, big, on the
// public website. The browser tab uses public/favicon-*.png (index.html).
//
// Two copies of the picture: public/chernozem-logo-128.png (128 px, a few
// KB) for the small logo the app shows everywhere, up to 64 px (sharp on a
// 2x screen), and public/chernozem-logo.png (512 px, 150 KB: more than
// half of a first visit's bytes otherwise) only where the logo is drawn
// bigger than that.
//
// WHAT IT RECEIVES
//   size       height in px (the pin is taller than wide; default 26);
//              above 64 the big file is used
//   className  extra class names (optional)
//   label      text for screen readers; "" (default) when a name is
//              already next to it
//
// WHO EDITS IT
// Whoever changes the brand. Replace the PNG files in public/ to change
// the picture (both sizes: the small one is the big one shrunk).

export const LOGO_SRC = "/chernozem-logo-128.png";
export const LOGO_SRC_LARGE = "/chernozem-logo.png";
// The biggest size (px) the small file still looks sharp at.
export const LOGO_SMALL_MAX = 64;

export default function Logo({ size = 26, className = "", label = "" }) {
  return (
    <img
      src={size > LOGO_SMALL_MAX ? LOGO_SRC_LARGE : LOGO_SRC}
      loading={size > LOGO_SMALL_MAX ? "lazy" : undefined}
      width={size}
      height={size}
      className={["logo", className].filter(Boolean).join(" ")}
      alt={label}
      aria-hidden={label ? undefined : "true"}
      draggable="false"
    />
  );
}
