// Pilot numbers (shared/pilot-numbers.ts): the shop's numbers in the Shopinbos pilot, on the web (/home/pilot-numbers)
// and the phone (pilot-numbers screen).
const en = {
  "metaTitle": "Pilot numbers",
  "title": "Pilot numbers",
  "sub": "How your shop is doing in the Shopinbos pilot: visits from your link and QR code, followers, repeat buyers, resell sales and your videos.",
  "open": "Pilot numbers",
  "loadFailed": "Couldn't load your numbers. Try again.",
  "off": "Pilot numbers show when your shop is in the Shopinbos pilot.",
  "visits.title": "Visits from your link and QR code",
  "visits.days7": "Last 7 days",
  "visits.days30": "Last 30 days",
  "visits.split": "{link} from the link · {qr} from the QR code",
  "plug.title": "Joined Plug from your link or QR",
  "plug.soon": "Starts when Plug launches",
  "followers.title": "Followers",
  "followers.fromLinks": "{count} from your link or QR code",
  "buyers.title": "Repeat buyers",
  "buyers.of": "{repeat} of {buyers} buyers ordered twice or more",
  "resell.title": "Sales from resell links",
  "resell.sales": "{count, plural, =0 {No sales yet} one {# sale} other {# sales}}",
  "resell.value": "Worth {amount}",
  "resell.commission": "Commission to resellers: {amount}",
  "videos.title": "Your top videos",
  "videos.views": "{count, plural, =0 {No views yet} one {# view} other {# views}}",
  "videos.orders": "{count, plural, =0 {No orders for this product since the video went up} one {# order for this product since the video went up} other {# orders for this product since the video went up}}",
  "videos.totalViews": "{count, plural, =0 {No video views yet} one {# video view in all} other {# video views in all}}",
  "videos.empty": "No videos yet. Post a product video to see its views here.",
  "videos.note": "Orders are for the product since the video went up. They aren't proof the video made the sale.",
} satisfies Record<string, string>;

export default en;
