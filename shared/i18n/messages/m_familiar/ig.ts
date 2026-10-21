// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "status.yours": "Status gị",
  "status.add": "Bipụta status",
  "status.yoursOpen": "Lee status gị",
  "status.openOf": "Lee status {name}",
  "status.views": "Mmadụ {count} lere ya",
  "role.seller": "Ụlọ ahịa",
  "role.supplier": "Onye na-ebubata ngwaahịa",
  "role.partner": "Onye mmekọ nnyefe",
  "ago.minutes": "nkeji {count} gara aga",
  "ago.hours": "awa {count} gara aga",
  "close": "Mechie",
  "previous": "Nke gara aga",
  "next": "Nke ọzọ",
  "like": "Mmasị",
  "unlike": "Wepụ mmasị",
  "level.open": "Ọkwa {level}: lee ụgwọ ọrụ gị",
  "level.openPlain": "Lee ụgwọ ọrụ gị",
  "level.short": "Ọk {level}",
  "check.count": "{done} n'ime {total} emechaala",
  "check.hide": "Zoo ndepụta a",
  "tour.step": "Nzọụkwụ {step} n'ime {total}",
  "tour.skip": "Wụfee",
  "tour.next": "Ọzọ",
  "tour.done": "Aghọtala m",
};

export default ig;
