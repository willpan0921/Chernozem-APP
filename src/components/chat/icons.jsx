// WHAT THIS FILE DOES
// Turns the icon names used in src/data/chats.js ("shield", "map-pin"...)
// into the Lucide icon components the chat draws. The data stores names so
// the team can change an icon without touching code.
//
// It also colours some icons the way the mockups do: the shield is red, the
// cloud is blue, the map and map pin are green, the dollar sign is amber,
// and everything else is grey. A data item can override this with its own
// "tone" ("red", "blue", "green", "amber" or "grey").
//
// WHO EDITS IT
// Danny. To use a new icon in the chat data, import it from "lucide-react"
// and add a line to the list below. Icon names: https://lucide.dev/icons

import {
  Shield,
  Cloud,
  FileText,
  Calendar,
  Landmark,
  Map,
  MapPin,
  SlidersHorizontal,
  CircleDollarSign,
  Camera,
  Plus,
  CircleHelp,
} from "lucide-react";

const icons = {
  shield: Shield,
  cloud: Cloud,
  "file-text": FileText,
  calendar: Calendar,
  landmark: Landmark,
  map: Map,
  "map-pin": MapPin,
  "sliders-horizontal": SlidersHorizontal,
  "circle-dollar-sign": CircleDollarSign,
  camera: Camera,
  plus: Plus,
};

// The colour each icon gets unless the data says otherwise. Icons not
// listed here stay the grey of the text around them.
const defaultTones = {
  shield: "red",
  cloud: "blue",
  map: "green",
  "map-pin": "green",
  "circle-dollar-sign": "amber",
};

// Draws the icon for a name. Unknown names show a question mark so a typo
// in the data is easy to spot.
//   name - the icon key from the data, e.g. "shield"
//   tone - optional colour override: "red", "blue", "green", "amber", "grey"
//   size - the icon size in pixels (default 14)
export default function ChatIcon({ name, tone, size = 14, className = "", ...rest }) {
  const Icon = icons[name] || CircleHelp;
  const colour = tone || defaultTones[name];
  const classes = [className, colour ? `chat-icon-${colour}` : ""].filter(Boolean).join(" ");
  return <Icon size={size} className={classes || undefined} {...rest} />;
}
