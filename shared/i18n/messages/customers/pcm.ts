// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  title: "Customers",
  sub: "{count} customers · {repeat} come back buy again",
  subEmpty: "Everybody wey don buy from you, from your store or sales wey you record.",
  "stat.customers": "Customers",
  "stat.allTime": "All time",
  "stat.repeat": "Buyers wey dey come back",
  "stat.repeatHint": "Buy pass one time",
  "stat.orders": "Orders",
  "stat.delivered": "Delivered",
  "stat.deliveredHint": "Orders wey reach",
  empty: "No customers yet",
  emptySub: "When person buy from your store, or you record sale, dem go show here.",
  recordSale: "Record sale",
  "badge.vip": "VIP",
  "badge.repeat": "Repeat",
  "badge.new": "New",
  lastOrder: "Last order {when}",
  onDate: "on {date}",
  showing: "We dey show the {shown} latest of {total} customers.",
};

export default pcm;
