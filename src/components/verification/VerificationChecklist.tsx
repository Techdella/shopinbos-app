import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { findDoc, isDocComplete, normalizeVerificationDocs, type DocConfig } from "@shared/verification-docs";

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

export function VerificationChecklist({ docs, configs, verificationStatus, href, welcome }: Props) {
  if (verificationStatus === "verified") return null;
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
          <Icon name="shield" size={15} /> {pending ? "Documents with our team" : `${done.length} of ${required.length} required documents in`}
        </div>
        <h2 id="verification-checklist-title" className="mb-0 mt-1.5 text-[20px] font-extrabold tracking-[-0.3px]">
          {pending
            ? "We're checking your documents"
            : welcome
              ? "You're in. Finish verification when your documents are ready."
              : "Finish verification to start selling"}
        </h2>
        <p className="mb-0 mt-1 text-[14px] leading-[1.5] text-app-ink-soft">
          {pending
            ? "This usually takes 1–2 business days. You can keep setting up while you wait."
            : "Set up your profile and draft products now. Sellers can find you, order and request quotes once you're verified. Have your RC or BN number? Verify instantly with CAC."}
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
                <Icon name={complete ? "check" : "dot"} size={13} /> {config.label}
              </li>
            );
          })}
        </ul>
      </div>
      {!pending && (
        <Link
          href={href}
          className="inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white transition hover:opacity-90"
        >
          {done.length ? "Continue verification" : "Add documents"} <Icon name="arrow" size={15} />
        </Link>
      )}
    </section>
  );
}
