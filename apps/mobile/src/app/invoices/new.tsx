import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ChipRow } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Chip, Field, Label, Notice, PillButton } from "@/components/ui";
import { createInvoice } from "@/lib/money";
import { EMPTY_INVOICE, INVOICE_DIRECTIONS, INVOICE_PARTIES, invoiceProblem, type InvoiceForm } from "@/lib/money-pure";
import { useT } from "@/lib/i18n";

// New invoice (the web's "New invoice" form on /home/invoices): one the seller sends (emailed when they add an
// email) or one they got and want to note, for a supplier, delivery partner or customer.

export default function NewInvoice() {
  const t = useT("m_money", "m_ui", "common");
  const [form, setForm] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof InvoiceForm>(key: K) => (value: InvoiceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setNote(null);
  };

  async function save() {
    const problem = invoiceProblem(form);
    if (problem) return setNote({ tone: "error", text: t(`inv.problem.${problem}`) });
    setBusy(true);
    setNote(null);
    try {
      const result = await createInvoice(form);
      const emailTried = result.invoice.direction === "sent" && Boolean(result.invoice.partyEmail);
      setNote({
        tone: emailTried && !result.emailed ? "info" : "success",
        text: !emailTried ? t("inv.saved") : result.emailed ? t("inv.emailed", { email: result.invoice.partyEmail }) : t("inv.notEmailed"),
      });
      setDone(true);
      setForm(EMPTY_INVOICE);
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("inv.saveProblem") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("inv.new")}
      sub={t("inv.newSub")}
      footer={
        done ? (
          <PillButton title={t("done")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/invoices"))} />
        ) : (
          <PillButton title={t("inv.create")} busy={busy} onPress={() => void save()} />
        )
      }
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <View>
        <Label>{t("inv.type")}</Label>
        <ChipRow>
          {INVOICE_DIRECTIONS.map((direction) => (
            <Chip key={direction} label={direction === "sent" ? t("inv.sending") : t("inv.gotIt")} on={form.direction === direction} onPress={() => set("direction")(direction)} />
          ))}
        </ChipRow>
      </View>

      <View>
        <Label>{t("inv.who")}</Label>
        <ChipRow>
          {INVOICE_PARTIES.map((party) => (
            <Chip key={party} label={t(`party.${party}`)} on={form.partyType === party} onPress={() => set("partyType")(party)} />
          ))}
        </ChipRow>
      </View>

      <View>
        <Label>{t("inv.theirName")}</Label>
        <Field value={form.partyName} onChangeText={set("partyName")} maxLength={160} placeholder={t("inv.businessName")} accessibilityLabel={t("inv.theirName")} />
      </View>

      <View>
        <Label>{t("inv.theirEmail")}</Label>
        <Field value={form.partyEmail} onChangeText={set("partyEmail")} maxLength={200} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="billing@example.com" accessibilityLabel={t("inv.theirEmail")} />
      </View>

      <View>
        <Label>{t("inv.amount")}</Label>
        <Field value={form.amount} onChangeText={set("amount")} keyboardType="decimal-pad" maxLength={16} placeholder="50000" accessibilityLabel={t("inv.amount")} style={{ fontSize: 20 }} />
      </View>

      <View>
        <Label>{t("inv.forWhat")}</Label>
        <Field value={form.description} onChangeText={set("description")} maxLength={300} placeholder={t("inv.forPlaceholder")} accessibilityLabel={t("inv.forWhat")} />
      </View>
    </Screen>
  );
}
