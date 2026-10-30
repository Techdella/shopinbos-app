// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "metaTitle": "Pilot numbers",
  "title": "Pilot numbers",
  "sub": "How your shop dey do for the Shopinbos pilot: people wey come from your link and QR code, followers, customers wey buy again, resell sales and your videos.",
  "open": "Pilot numbers",
  "loadFailed": "We no fit load your numbers. Try again.",
  "off": "Pilot numbers go show when your shop dey inside the Shopinbos pilot.",
  "visits.title": "People wey come from your link and QR code",
  "visits.days7": "Last 7 days",
  "visits.days30": "Last 30 days",
  "visits.split": "{link} from the link · {qr} from the QR code",
  "plug.title": "People wey join Plug from your link or QR",
  "plug.soon": "E go start when Plug launch",
  "followers.title": "Followers",
  "followers.fromLinks": "{count} from your link or QR code",
  "buyers.title": "Customers wey buy again",
  "buyers.of": "{repeat} out of {buyers} customers don order two times or more",
  "resell.title": "Sales from resell links",
  "resell.sales": "{count, plural, =0 {No sale yet} one {# sale} other {# sales}}",
  "resell.value": "E worth {amount}",
  "resell.commission": "Commission for resellers: {amount}",
  "videos.title": "Your top videos",
  "videos.views": "{count, plural, =0 {No view yet} one {# view} other {# views}}",
  "videos.orders": "{count, plural, =0 {No order for this product since the video go up} one {# order for this product since the video go up} other {# orders for this product since the video go up}}",
  "videos.totalViews": "{count, plural, =0 {No video view yet} one {# video view in all} other {# video views in all}}",
  "videos.empty": "No video yet. Post product video make you see the views here.",
  "videos.note": "The orders na for the product since the video go up. E no mean say na the video bring the sale.",
};

export default pcm;
