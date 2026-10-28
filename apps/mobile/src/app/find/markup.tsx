import { useState } from "react";
import { router } from "expo-router";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { MarkupPicker, markupOfPick, markupPickOf, type MarkupPick } from "@/components/seller/MarkupPicker";
import { Notice, PillButton } from "@/components/ui";
import { fetchMarkup, saveMarkup } from "@/lib/quick-add";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";

// Settings → "Your markup on supplier products": the same picker the first add asks with (20%, 30%, 50% or a ₦
// amount, rounded to nice prices). It sets the price of supplier products added from now on; My supplier products
// changes the ones already in the shop.

export default function MarkupSettings() {
  const t = useT("m_find");
  const loaded = useLoad(() => fetchMarkup());
  const [pick, setPick] = useState<MarkupPick | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const chosen = pick ?? (loaded.data ? markupPickOf(loaded.data.markup) : null);
  const markup = chosen ? markupOfPick(chosen) : null;

  async function save() {
    if (!markup) return;
    setBusy(true);
    setNote(null);
    try {
      await saveMarkup(markup);
      setNote({ tone: "success", text: t("markup.saved") });
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("quick.failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("markup.title")}
      heading={t("markup.question")}
      sub={t("markup.settingsSub")}
      footer={
        <>
          <PillButton testID="markup-settings-save" title={t("markup.save")} busy={busy} disabled={!markup} onPress={() => void save()} />
          <PillButton tone="white" size="md" title={t("markup.repriceMine")} onPress={() => router.push("/find/mine")} />
        </>
      }
    >
      {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
      {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {chosen ? <MarkupPicker value={chosen} onChange={setPick} /> : null}
    </Screen>
  );
}
