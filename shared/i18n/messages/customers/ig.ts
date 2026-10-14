// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  title: "Ndị ahịa",
  sub: "Ndị ahịa {count} · {repeat} lọghachiri zụọ ọzọ",
  subEmpty: "Onye ọ bụla zụrụ n'aka gị, site na store gị ma ọ bụ ahịa i dekọrọ.",
  "stat.customers": "Ndị ahịa",
  "stat.allTime": "Kemgbe mmalite",
  "stat.repeat": "Ndị na-alọghachi zụọ",
  "stat.repeatHint": "Zụrụ karịa otu ugboro",
  "stat.orders": "Orders",
  "stat.delivered": "Eruola",
  "stat.deliveredHint": "Orders ruru",
  empty: "Enweghị ndị ahịa ugbu a",
  emptySub: "Mgbe mmadụ zụrụ n'store gị, ma ọ bụ ị dekọọ ahịa, ha ga-egosi ebe a.",
  recordSale: "Dekọọ ahịa",
  "badge.vip": "VIP",
  "badge.repeat": "Na-alọghachi",
  "badge.new": "Ọhụrụ",
  lastOrder: "Order ikpeazụ {when}",
  onDate: "na {date}",
  showing: "Anyị na-egosi {shown} kacha ọhụrụ n'ime ndị ahịa {total}.",
};

export default ig;
