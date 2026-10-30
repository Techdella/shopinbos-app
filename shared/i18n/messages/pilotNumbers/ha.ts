// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "metaTitle": "Lambobin gwaji",
  "title": "Lambobin gwaji",
  "sub": "Yadda shagonka ke tafiya a gwajin Shopinbos: masu ziyara daga link da QR code ɗinka, followers, masu sake saya, sayarwar resell da bidiyoyinka.",
  "open": "Lambobin gwaji",
  "loadFailed": "Ba a iya loda lambobinka ba. Sake gwadawa.",
  "off": "Lambobin gwaji za su bayyana idan shagonka yana cikin gwajin Shopinbos.",
  "visits.title": "Ziyara daga link da QR code ɗinka",
  "visits.days7": "Kwanaki 7 da suka wuce",
  "visits.days30": "Kwanaki 30 da suka wuce",
  "visits.split": "{link} daga link · {qr} daga QR code",
  "plug.title": "Waɗanda suka shiga Plug daga link ko QR ɗinka",
  "plug.soon": "Zai fara idan an ƙaddamar da Plug",
  "followers.title": "Followers",
  "followers.fromLinks": "{count} daga link ko QR code ɗinka",
  "buyers.title": "Masu sake saya",
  "buyers.of": "{repeat} cikin {buyers} masu saya sun yi oda sau biyu ko fiye",
  "resell.title": "Sayarwa daga resell links",
  "resell.sales": "{count, plural, =0 {Babu sayarwa tukuna} one {Sayarwa #} other {Sayarwa #}}",
  "resell.value": "Darajarsu {amount}",
  "resell.commission": "Kwamishan ga resellers: {amount}",
  "videos.title": "Manyan bidiyoyinka",
  "videos.views": "{count, plural, =0 {Babu kallo tukuna} one {Kallo #} other {Kallo #}}",
  "videos.orders": "{count, plural, =0 {Babu oda don wannan kaya tun da aka saka bidiyon} one {Oda # don wannan kaya tun da aka saka bidiyon} other {Oda # don wannan kaya tun da aka saka bidiyon}}",
  "videos.totalViews": "{count, plural, =0 {Babu kallon bidiyo tukuna} one {Kallon bidiyo # gaba ɗaya} other {Kallon bidiyo # gaba ɗaya}}",
  "videos.empty": "Babu bidiyo tukuna. Saka bidiyon kaya don ganin kallo a nan.",
  "videos.note": "Odar na kayan ne tun da aka saka bidiyon. Ba hujja ba ce cewa bidiyon ne ya kawo sayarwar.",
};

export default ha;
