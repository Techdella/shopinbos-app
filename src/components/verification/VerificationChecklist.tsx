import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { findDoc, isDocComplete, normalizeVerificationDocs, type DocConfig } from "@shared/verification-docs";
import { getT } from "@/lib/i18n/server";
import { docLabel } from "./doc-words";

// Shown on a partner's dashboard until they're verified: which required documents are in, and one button to
// finish. Keeps people who skipped documents during onboarding moving instead of drifting off.

interface Props {
  docs: unknown;
  configs: DocConfig[];
  verificationStatus: string;
  href: string;
  /** Just arrived from onboarding via "Continue without documents". */
  welcome?: boolean;
}

export async function VerificationChecklist({ docs, configs, verificationStatus, href, welcome }: Props) {
  if (verificationStatus === "verified") return null;
  const t = await getT("verification");
  const stored = normalizeVerificationDocs(docs);
  const required = configs.filter((config) => config.required);
  const done = required.filter((config) => isDocComplete(findDoc(stored, config.type)));
  // "pending" only means something once every required document is in (partner onboarding sets it on submit).
  const pending = verificationStatus === "pending" && done.length === required.length;

  return (
    <section
      aria-labelledby="verification-checklist-title"
      className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6"
    >
      <div className="min-w-0 flex-1 basis-[280px]">
        <div className="flex items-center gap-2 text-[13px] font-bold text-app-ink-soft">
          <Icon name="shield" size={15} /> {pending ? t("checklist.withTeam") : t("checklist.countIn", { done: done.length, total: required.length })}
        </div>
        <h2 id="verification-checklist-title" className="mb-0 mt-1.5 text-[20px] font-extrabold tracking-[-0.3px]">
          {pending
            ? t("checklist.checking")
            : welcome
              ? t("checklist.welcome")
              : t("checklist.finish")}
        </h2>
        <p className="mb-0 mt-1 text-[14px] leading-[1.5] text-app-ink-soft">
          {pending
            ? t("checklist.pendingBody")
            : t("checklist.body")}
        </p>
        <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
          {required.map((config) => {
            const complete = isDocComplete(findDoc(stored, config.type));
            return (
              <li
                key={config.type}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold",
                  complete ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft",
                )}
              >
                <Icon name={complete ? "check" : "dot"} size={13} /> {docLabel(t, config.type, config.label)}
              </li>
            );
          })}
        </ul>
      </div>
      {!pending && (
        <Link
          href={href}
          className="inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white transition hover:opacity-90"
        >
          {done.length ? t("checklist.continue") : t("checklist.addDocs")} <Icon name="arrow" size={15} />
        </Link>
      )}
    </section>
  );
}
