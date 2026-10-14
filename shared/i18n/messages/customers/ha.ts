// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  title: "Kwastomomi",
  sub: "Kwastomomi {count} · {repeat} sun dawo sun sake saya",
  subEmpty: "Duk wanda ya saya daga gare ka, daga store ɗinka ko cinikin da ka rubuta.",
  "stat.customers": "Kwastomomi",
  "stat.allTime": "Tun farko",
  "stat.repeat": "Masu dawowa saye",
  "stat.repeatHint": "Sun saya fiye da sau ɗaya",
  "stat.orders": "Orders",
  "stat.delivered": "An kai",
  "stat.deliveredHint": "Orders da suka iso",
  empty: "Babu kwastomomi tukuna",
  emptySub: "Idan wani ya saya daga store ɗinka, ko ka rubuta ciniki, za su bayyana a nan.",
  recordSale: "Rubuta ciniki",
  "badge.vip": "VIP",
  "badge.repeat": "Mai dawowa",
  "badge.new": "Sabo",
  lastOrder: "Order ta ƙarshe {when}",
  onDate: "a {date}",
  showing: "Ana nuna sabbi {shown} cikin kwastomomi {total}.",
};

export default ha;
