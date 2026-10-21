// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "status.yours": "Matsayinka",
  "status.add": "Saka matsayi",
  "status.yoursOpen": "Duba matsayinka",
  "status.openOf": "Duba matsayin {name}",
  "status.views": "Kallo {count}",
  "role.seller": "Shago",
  "role.supplier": "Mai samar da kaya",
  "role.partner": "Abokin isar da kaya",
  "ago.minutes": "minti {count} da suka wuce",
  "ago.hours": "awa {count} da suka wuce",
  "close": "Rufe",
  "previous": "Na baya",
  "next": "Na gaba",
  "like": "So",
  "unlike": "Cire so",
  "level.open": "Mataki {level}: duba ladanka",
  "level.openPlain": "Duba ladanka",
  "level.short": "Mt {level}",
  "check.count": "{done} cikin {total} an gama",
  "check.hide": "Ɓoye wannan jerin",
  "tour.step": "Mataki {step} cikin {total}",
  "tour.skip": "Tsallake",
  "tour.next": "Gaba",
  "tour.done": "Na gane",
};

export default ha;
