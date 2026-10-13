// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "stage.Waiting for payment": "Dey wait for payment",
  "stage.Ready to go out": "Ready to comot",
  "stage.Needs a rider": "E need rider",
  "stage.On the way": "E dey road",
  "stage.Delivered": "E don reach",
  "stage.Returned": "Dem return am",
  "stage.Refunded": "We don refund",
  "stage.Cancelled": "E don cancel",
  "pay.Paid": "Don pay",
  "pay.Not paid yet": "Never pay",
  "pay.Refunded": "We don refund",
  "pay.Unpaid": "No pay",
  "channel.WhatsApp": "WhatsApp",
  "channel.Online store": "Online store",
  "channel.In person": "Face to face",
  "stock.Sold out": "E don finish",
};

export default pcm;
