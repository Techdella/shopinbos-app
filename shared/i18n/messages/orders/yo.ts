// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  "stage.Waiting for payment": "Ń dúró de ìsanwó",
  "stage.Ready to go out": "Ṣetán láti jáde",
  "stage.Needs a rider": "Ó nílò rider",
  "stage.On the way": "Ó wà lójú ọ̀nà",
  "stage.Delivered": "Ó ti dé",
  "stage.Returned": "Wọ́n dá a padà",
  "stage.Refunded": "A ti dá owó padà",
  "stage.Cancelled": "A ti fagilé",
  "pay.Paid": "Ti san",
  "pay.Not paid yet": "Kò tíì san",
  "pay.Refunded": "A ti dá owó padà",
  "pay.Unpaid": "Kò san",
  "channel.WhatsApp": "WhatsApp",
  "channel.Online store": "Store orí ayélujára",
  "channel.In person": "Ní ojúkojú",
  "stock.Sold out": "Ó ti tán",
};

export default yo;
