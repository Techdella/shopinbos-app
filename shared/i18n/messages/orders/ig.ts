// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "stage.Waiting for payment": "Na-eche ịkwụ ụgwọ",
  "stage.Ready to go out": "Adịla njikere ịpụ",
  "stage.Needs a rider": "Ọ chọrọ rider",
  "stage.On the way": "Ọ nọ n'ụzọ",
  "stage.Delivered": "Eruola",
  "stage.Returned": "Eweghachiri ya",
  "stage.Refunded": "Akwụghachiri ego",
  "stage.Cancelled": "Akagbuola",
  "pay.Paid": "Akwụọla",
  "pay.Not paid yet": "Akwụbeghị",
  "pay.Refunded": "Akwụghachiri ego",
  "pay.Unpaid": "Akwụghị",
  "channel.WhatsApp": "WhatsApp",
  "channel.Online store": "Store n'ịntanetị",
  "channel.In person": "Ihu na ihu",
  "stock.Sold out": "Ọ gwụla",
};

export default ig;
