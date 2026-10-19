// WHAT THIS FILE DOES
// Turns the icon names the AI pages use ("map", "calendar"...) into the
// Lucide icon components the chat draws. The pages pass names so the team
// can change an icon without touching the chat code.
//
// It also colours some icons: the shield is red, the cloud is blue, the
// map pin is green, and everything else is grey.
// An item can override this with its own "tone" ("red", "blue", "green",
// "amber" or "grey").
//
// WHO EDITS IT
// Danny. To use a new icon, import it from "lucide-react" and add a line to
// the list below. Icon names: https://lucide.dev/icons

import { Shield, Cloud, Calendar, Map, MapPin, SlidersHorizontal, ListOrdered, Database, Wheat, LayoutGrid, CircleHelp, Satellite, Camera, Sprout } from "lucide-react";

const icons = {
  // Atlas AI
  map: Map,
  calendar: Calendar,
  "list-ordered": ListOrdered,
  database: Database,
  "sliders-horizontal": SlidersHorizontal,
  "map-pin": MapPin,
  // Field AI
  wheat: Wheat,
  "layout-grid": LayoutGrid,
  shield: Shield,
  cloud: Cloud,
  satellite: Satellite,
  camera: Camera,
  sprout: Sprout,
};

// The colour each icon gets unless the item says otherwise. Icons not
// listed here stay the grey of the text around them.
const defaultTones = {
  shield: "red",
  cloud: "blue",
  "map-pin": "green",
  camera: "red",
  sprout: "green",
};

// Draws the icon for a name. Unknown names show a question mark so a typo
// is easy to spot.
//   name - the icon key, e.g. "shield"
//   tone - optional colour override: "red", "blue", "green", "amber", "grey"
//   size - the icon size in pixels (default 14)
export default function ChatIcon({ name, tone, size = 14, className = "", ...rest }) {
  const Icon = icons[name] || CircleHelp;
  const colour = tone || defaultTones[name];
  const classes = [className, colour ? `chat-icon-${colour}` : ""].filter(Boolean).join(" ");
  return <Icon size={size} className={classes || undefined} aria-hidden="true" {...rest} />;
}
