// Phone app (apps/mobile): the "Familiar app" pieces every business role shares: the Status row and story viewer,
// the level pill and Rewards, quick actions, the set-up checklist, the first-login tour, credits, Ask Peggy, Create
// with Rex and the posts calendar (components/familiar, lib/familiar.ts). English is the source of truth.
const en = {
  "status.yours": "Your status",
  "status.add": "Post a status",
  "status.yoursOpen": "See your status",
  "status.openOf": "See {name}'s status",
  "status.views": "{count} views",
  "role.seller": "Shop",
  "role.supplier": "Supplier",
  "role.partner": "Delivery partner",
  "ago.minutes": "{count} min ago",
  "ago.hours": "{count} h ago",
  "close": "Close",
  "previous": "Previous",
  "next": "Next",
  "like": "Like",
  "unlike": "Unlike",
  "level.open": "Level {level}: see your rewards",
  "level.openPlain": "See your rewards",
  "level.short": "Lv {level}",
  "check.count": "{done} of {total} done",
  "check.hide": "Hide this list",
  "tour.step": "Step {step} of {total}",
  "tour.skip": "Skip",
  "tour.next": "Next",
  "tour.done": "Got it",
} satisfies Record<string, string>;

export default en;
