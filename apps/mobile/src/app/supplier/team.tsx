import { useState } from "react";
import { Alert, View } from "react-native";
import { List, Pill, Row } from "@/components/design";
import { ChipRow, EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { FieldLabel } from "@/components/SupplierKit";
import { Chip, Field, Notice, PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { addTeamMember, fetchTeam, removeTeamMember, setTeamMemberActive, TEAM_ROLES, type TeamMember, type TeamRole } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";

// The people on a supplier's account (the web's /supplier/team, in the app): who they are and what they do, on or
// off; tap one to turn them off, back on, or remove them. "Add someone" takes a name, an email, a phone and a role.
// Backed by /api/mobile/supplier/team. The plan's team limit comes from the server (canAdd).

export default function SupplierTeam() {
  const t = useT("m_supplier", "common");
  const team = useLoad(fetchTeam);
  const data = team.data;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<TeamRole>("manager");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const roleLabel = (value: string) => ((TEAM_ROLES as readonly string[]).includes(value) ? t.dynamic(`team.role.${value}`, value) : value);

  async function add() {
    if (name.trim().length < 2) return setNote({ tone: "error", text: t("team.needName") });
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setNote({ tone: "error", text: t("team.needEmail") });
    setBusy(true);
    setNote(null);
    try {
      const next = await addTeamMember({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role });
      team.setData({ ...next, verified: data?.verified });
      setName("");
      setEmail("");
      setPhone("");
      setAdding(false);
      setNote({ tone: "success", text: t("team.added") });
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("team.failed") });
    } finally {
      setBusy(false);
    }
  }

  async function change(work: () => Promise<unknown>) {
    setNote(null);
    try {
      await work();
      await team.reload();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("team.failed") });
    }
  }

  function manage(member: TeamMember) {
    const active = member.status === "active";
    Alert.alert(member.name, member.email, [
      { text: active ? t("team.turnOff") : t("team.turnOn"), onPress: () => void change(() => setTeamMemberActive(member.id, !active)) },
      {
        text: t("team.remove"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("team.removeTitle", { name: member.name }), t("team.removeBody"), [
            { text: t("cancel"), style: "cancel" },
            { text: t("team.remove"), style: "destructive", onPress: () => void change(() => removeTeamMember(member.id)) },
          ]),
      },
      { text: t("cancel"), style: "cancel" },
    ]);
  }

  const full = Boolean(data && !data.canAdd);

  return (
    <Screen
      title={t("team.title")}
      refreshing={team.refreshing}
      onRefresh={() => void team.refresh()}
      footer={
        data && data.verified !== false ? (
          adding ? (
            <PillButton title={t("team.add")} tone="accent" busy={busy} onPress={() => void add()} />
          ) : (
            <PillButton title={t("team.addSomeone")} disabled={full} onPress={() => setAdding(true)} />
          )
        ) : undefined
      }
    >
      {team.loading && !data ? <LoadingBlock /> : null}
      {team.error && !data ? <ErrorState message={team.error} onRetry={() => void team.reload()} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {data?.verified === false ? <Notice tone="info">{t("team.verifyFirst")}</Notice> : null}
      {full ? <Notice tone="info">{t("team.full", { limit: data?.limit ?? 0 })}</Notice> : null}

      {data && !data.members.length && !adding ? <EmptyState icon="users" title={t("team.empty")} /> : null}
      {data?.members.length ? (
        <List>
          {data.members.map((member) => (
            <Row
              key={member.id}
              lead={<Initials name={member.name} />}
              title={member.name}
              sub={`${roleLabel(member.role)} · ${member.email}`}
              right={<Pill label={member.status === "active" ? t("team.on") : t("team.off")} tone={member.status === "active" ? "ok" : "gray"} />}
              onPress={data.verified === false ? undefined : () => manage(member)}
            />
          ))}
        </List>
      ) : null}

      {adding ? (
        <View style={{ gap: 14 }}>
          <View>
            <FieldLabel>{t("team.name")}</FieldLabel>
            <Field value={name} onChangeText={setName} maxLength={80} placeholder="Chidi Okafor" accessibilityLabel={t("team.name")} />
          </View>
          <View>
            <FieldLabel>{t("team.email")}</FieldLabel>
            <Field value={email} onChangeText={setEmail} maxLength={200} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="chidi@example.com" accessibilityLabel={t("team.email")} />
          </View>
          <View>
            <FieldLabel>{t("team.phone")}</FieldLabel>
            <Field value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" placeholder="+234…" accessibilityLabel={t("team.phone")} />
          </View>
          <View>
            <FieldLabel>{t("team.roleLabel")}</FieldLabel>
            <ChipRow>{TEAM_ROLES.map((value) => <Chip key={value} label={roleLabel(value)} on={role === value} onPress={() => setRole(value)} />)}</ChipRow>
          </View>
          <PillButton title={t("cancel")} tone="white" size="md" onPress={() => setAdding(false)} />
        </View>
      ) : null}
    </Screen>
  );
}
