// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "stage.Waiting for payment": "Ana jiran biya",
  "stage.Ready to go out": "A shirye don fita",
  "stage.Needs a rider": "Yana buƙatar rider",
  "stage.On the way": "Yana kan hanya",
  "stage.Delivered": "An kai",
  "stage.Returned": "An dawo da shi",
  "stage.Refunded": "An mayar da kuɗi",
  "stage.Cancelled": "An soke",
  "pay.Paid": "An biya",
  "pay.Not paid yet": "Ba a biya ba tukuna",
  "pay.Refunded": "An mayar da kuɗi",
  "pay.Unpaid": "Ba a biya ba",
  "channel.WhatsApp": "WhatsApp",
  "channel.Online store": "Store na intanet",
  "channel.In person": "Ido da ido",
  "stock.Sold out": "Ya ƙare",
};

export default ha;
