"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import { PACK_FORMAT_INFO, PACK_FORMATS, PRODUCT_TYPE_INFO, PRODUCT_TYPES, type ProductType } from "@shared/packaging";
import { PACKAGING_SERVICES, PACKAGING_REQUEST_STATUS_LABEL, type PackagingRequestStatus, type PackagingService } from "@shared/packaging-requests";

export interface PastRequest {
  id: string;
  productName: string;
  packType: string;
  quantity: number;
  status: string;
  createdAt: string;
}

const inputClass = "h-11 w-full rounded-[12px] border border-app-line bg-white px-3 text-[14px] outline-none focus:border-app-ink";

/** The custom packaging request: what to make, how many, by when, references, and how to reach the seller. */
export function RequestForm({
  migrationNeeded,
  design,
  past,
  products,
  contact,
  businessName,
}: {
  migrationNeeded: boolean;
  design: { id: string; title: string; previewUrl: string | null; format: string | null; productType: string | null } | null;
  past: PastRequest[];
  products: Array<{ id: string; name: string; type: ProductType }>;
  contact: { name: string; phone: string; email: string };
  businessName: string;
}) {
  const t = useT("packaging", "common");
  const media = useMediaLibrary();
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState<ProductType>((PRODUCT_TYPES as readonly string[]).includes(design?.productType ?? "") ? (design!.productType as ProductType) : "food");
  const [packType, setPackType] = useState<string>(design?.format && (PACK_FORMATS as readonly string[]).includes(design.format) ? design.format : "pouch");
  const [quantity, setQuantity] = useState("500");
  const [size, setSize] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [services, setServices] = useState<PackagingService[]>(["design", "print"]);
  const [details, setDetails] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [email, setEmail] = useState(contact.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (migrationNeeded) return <Notice tone="info">{t("req.migration")}</Notice>;

  function toggle(service: PackagingService) {
    setServices((current) => (current.includes(service) ? current.filter((item) => item !== service) : [...current, service]));
  }

  async function addRefs() {
    const picked = await media.open({ multiple: true, title: t("req.refsPick") });
    setRefs((current) => [...new Set([...current, ...picked.map((asset) => asset.url)])].slice(0, 8));
  }

  function pickProduct(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    setProductName(product.name);
    setProductType(product.type);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/app/packaging/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: design?.id ?? null,
          productName: productName.trim(),
          productType,
          packType,
          quantity: Math.round(Number(quantity) || 0),
          size: size.trim() || null,
          budget: budget ? Math.round(Number(budget.replace(/[^\d.]/g, "")) || 0) : null,
          deadline: deadline || null,
          services,
          details: [details.trim(), businessName ? `Business: ${businessName}` : ""].filter(Boolean).join("\n"),
          referenceUrls: refs,
          contactName: name.trim(),
          contactPhone: phone.trim(),
          contactEmail: email.trim() || null,
        }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { id: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? t("req.failed"));
      setSent(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("req.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="grid max-w-[720px] gap-4 rounded-[22px] border border-app-line bg-white p-6">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-app-canvas"><Icon name="check" size={22} /></span>
        <p className="m-0 text-[20px] font-extrabold">{t("req.sentTitle")}</p>
        <p className="m-0 text-[14.5px] text-app-ink-soft">{t("req.sentBody")}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/home/labels" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline">{t("req.backToLabels")}</Link>
          <Link href="/home/labels/packaging" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline">{t("req.designMyself")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      {media.dialog}
      <div className="grid gap-4">
        {design ? (
          <div className="flex items-center gap-3 rounded-[18px] border border-app-line bg-white p-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-app-canvas">
              {design.previewUrl ? <img src={design.previewUrl} alt="" className="max-h-full max-w-full object-contain" /> : <Icon name="package" size={20} />}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[12.5px] font-bold text-app-ink-soft">{t("req.startingFrom")}</p>
              <p className="m-0 truncate text-[15px] font-extrabold">{design.title}</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] font-extrabold">{t("req.what")}</p>
          {products.length ? (
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.fromStore")}
              <select defaultValue="" onChange={(event) => pickProduct(event.target.value)} className={inputClass}>
                <option value="">{t("req.chooseProduct")}</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.productName")}
              <input value={productName} onChange={(event) => setProductName(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("type.label")}
              <select value={productType} onChange={(event) => setProductType(event.target.value as ProductType)} className={inputClass}>
                {PRODUCT_TYPES.map((value) => <option key={value} value={value}>{t.dynamic(`type.${value}`, PRODUCT_TYPE_INFO[value].name)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.packType")}
              <select value={packType} onChange={(event) => setPackType(event.target.value)} className={inputClass}>
                {PACK_FORMATS.map((value) => <option key={value} value={value}>{t.dynamic(`format.${value}`, PACK_FORMAT_INFO[value].name)}</option>)}
                <option value="other">{t("req.otherPack")}</option>
              </select>
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.size")}
              <input value={size} onChange={(event) => setSize(event.target.value)} placeholder={t("req.sizePlaceholder")} className={inputClass} />
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.quantity")}
              <input value={quantity} inputMode="numeric" onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))} className={inputClass} />
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.budget")}
              <input value={budget} inputMode="numeric" onChange={(event) => setBudget(event.target.value.replace(/[^\d]/g, ""))} placeholder="₦" className={inputClass} />
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("req.deadline")}
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className={inputClass} />
            </label>
          </div>
        </section>

        <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] font-extrabold">{t("req.services")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PACKAGING_SERVICES.map((service) => (
              <label key={service} className={cx("flex cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-[13.5px] font-bold", services.includes(service) ? "border-app-ink bg-app-canvas" : "border-app-line")}>
                <input type="checkbox" checked={services.includes(service)} onChange={() => toggle(service)} className="h-4 w-4" />
                {t(`svc.${service}`)}
              </label>
            ))}
          </div>
          <label className="grid gap-1 text-[13px] font-bold">
            {t("req.details")}
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={5} placeholder={t("req.detailsPlaceholder")} className="w-full rounded-[12px] border border-app-line px-3 py-2 text-[14px] outline-none focus:border-app-ink" />
          </label>
          <div className="grid gap-2">
            <p className="m-0 text-[13px] font-bold">{t("req.refs")}</p>
            <div className="flex flex-wrap gap-2">
              {refs.map((url) => (
                <span key={url} className="relative h-16 w-16 overflow-hidden rounded-[12px] border border-app-line">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button type="button" aria-label={t("req.removeRef")} onClick={() => setRefs((current) => current.filter((item) => item !== url))} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] shadow"><Icon name="x" size={10} /></button>
                </span>
              ))}
              {refs.length < 8 ? (
                <button type="button" onClick={() => void addRefs()} className="grid h-16 w-16 place-items-center rounded-[12px] border border-dashed border-app-line text-app-ink-soft"><Icon name="plus" size={18} /></button>
              ) : null}
            </div>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("req.refsHint")}</p>
          </div>
        </section>

        <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] font-extrabold">{t("req.contact")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-[13px] font-bold">{t("req.name")}<input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
            <label className="grid gap-1 text-[13px] font-bold">{t("req.phone")}<input value={phone} type="tel" onChange={(event) => setPhone(event.target.value)} className={inputClass} /></label>
            <label className="grid gap-1 text-[13px] font-bold">{t("req.email")}<input value={email} type="email" onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
          </div>
        </section>

        {error ? <Notice tone="error">{error}</Notice> : null}
        <PillButton busy={busy} onClick={() => void submit()} className="w-full sm:w-fit">{t("req.send")}</PillButton>
      </div>

      <aside className="grid gap-4">
        <div className="grid gap-2 rounded-[20px] bg-app-ink p-5 text-white">
          <p className="m-0 text-[15.5px] font-extrabold">{t("req.howTitle")}</p>
          <ol className="m-0 grid gap-1.5 pl-5 text-[13.5px] text-white/80">
            <li>{t("req.how1")}</li>
            <li>{t("req.how2")}</li>
            <li>{t("req.how3")}</li>
          </ol>
        </div>
        {past.length ? (
          <div className="grid gap-2 rounded-[20px] border border-app-line bg-white p-4">
            <p className="m-0 text-[14.5px] font-extrabold">{t("req.yours")}</p>
            {past.map((request) => (
              <div key={request.id} className="flex items-center justify-between gap-2 border-t border-app-line pt-2 text-[13px]">
                <div className="min-w-0">
                  <p className="m-0 truncate font-bold">{request.productName}</p>
                  <p className="m-0 text-app-ink-soft">{request.quantity.toLocaleString("en-NG")} × {t.dynamic(`format.${request.packType}`, request.packType)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-app-canvas px-2 py-0.5 text-[11.5px] font-bold">{t.dynamic(`status.${request.status}`, PACKAGING_REQUEST_STATUS_LABEL[request.status as PackagingRequestStatus] ?? request.status)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
