import { Mascot, Spinner } from "@/components/app-ui";

// Rex Studio is full screen (no sidebar), so its loading state is too.
export default function Loading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-app-canvas font-app text-app-ink" role="status">
      <div className="flex flex-col items-center gap-3">
        <Mascot name="rex" mood="thinking" alt="" className="h-14 w-14" />
        <p className="m-0 flex items-center gap-2 text-[14px] font-bold"><Spinner className="h-4 w-4" /> Opening Rex Studio…</p>
      </div>
    </div>
  );
}
