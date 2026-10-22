import { Card, CardHead } from "@/components/app-kit";
import { BuyExtraButton } from "@/components/plans/BuyExtraButton";
import { getT } from "@/lib/i18n/server";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { messageAllowance } from "@/lib/plans/messages.server";
import { addonPrices } from "@shared/platform-pricing";
import { MESSAGES_PER_PACK } from "@shared/plan-extras";

// Settings › Billing: SMS/WhatsApp messages Shopinbos sends for the store (src/lib/plans/messages.server.ts) and
// the packs to buy more.
export async function MessagePacksCard({ userId }: { userId: string }) {
  const [t, allowance, book] = await Promise.all([getT("payments"), messageAllowance(userId), getPriceBook()]);
  const prices = addonPrices(book);
  const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;
  return (
    <Card className="p-5">
      <CardHead title={t("msg.title")} sub={allowance.included > 0 ? t("msg.included", { used: allowance.used, included: allowance.included }) : t("msg.none")} />
      <dl className="m-0 mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[16px] bg-app-canvas px-4 py-3">
          <dt className="text-[13px] text-app-ink-soft">{t("msg.smsLeft")}</dt>
          <dd className="m-0 mt-1 text-[24px] font-extrabold leading-none">{allowance.sms}</dd>
        </div>
        <div className="rounded-[16px] bg-app-canvas px-4 py-3">
          <dt className="text-[13px] text-app-ink-soft">{t("msg.waLeft")}</dt>
          <dd className="m-0 mt-1 text-[24px] font-extrabold leading-none">{allowance.whatsapp}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        <BuyExtraButton kind="sms_pack" label={t("msg.buySms", { count: MESSAGES_PER_PACK, price: naira(prices.smsPack) })} />
        <BuyExtraButton kind="whatsapp_pack" label={t("msg.buyWa", { count: MESSAGES_PER_PACK, price: naira(prices.whatsappPack) })} />
      </div>
      <p className="mb-0 mt-3 text-[12.5px] text-app-ink-soft">{t("msg.own")}</p>
    </Card>
  );
}
