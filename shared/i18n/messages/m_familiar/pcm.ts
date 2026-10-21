// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "status.yours": "Your status",
  "status.add": "Post status",
  "status.yoursOpen": "See your status",
  "status.openOf": "See {name} status",
  "status.views": "{count} people don see am",
  "role.seller": "Shop",
  "role.supplier": "Supplier",
  "role.partner": "Delivery partner",
  "ago.minutes": "{count} min ago",
  "ago.hours": "{count} hour ago",
  "close": "Close",
  "previous": "Back",
  "next": "Next",
  "like": "Like am",
  "unlike": "Remove like",
  "level.open": "Level {level}: see your rewards",
  "level.openPlain": "See your rewards",
  "level.short": "Lv {level}",
  "check.count": "{done} of {total} don finish",
  "check.hide": "Hide this list",
  "tour.step": "Step {step} of {total}",
  "tour.skip": "Skip",
  "tour.next": "Next",
  "tour.done": "I don understand",
};

export default pcm;
