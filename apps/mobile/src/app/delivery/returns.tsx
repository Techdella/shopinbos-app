import { useState } from "react";
import { View } from "react-native";
import { List, Row, Seg } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Chips } from "@/components/seller/bits";
import { Notice, T, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Returns for a change of mind (shared/fault-matrix.ts row 6; the web's card on /home/shipping): take returns or not,
// how many days after delivery, and who pays the trip back. GET/PATCH /api/app/returns-settings. Wrong or damaged
// items always go through the customer's "Report a problem", whatever this says.

interface ReturnsSetting {
  returnsAllowed: boolean;
  returnWindowDays: number;
  returnShippingPayer: string;
}

const WINDOWS = [3, 7, 14, 30];

export default function ReturnsSettingScreen() {
  const t = useT("m_faults");
  const loaded = useLoad(() => api<ReturnsSetting>("/api/app/returns-settings"));
  const [value, setValue] = useState<ReturnsSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const current = value ?? loaded.data ?? null;

  async function save(next: ReturnsSetting) {
    setValue(next);
    setError(null);
    setSaved(false);
    try {
      setValue(await api<ReturnsSetting>("/api/app/returns-settings", { method: "PATCH", json: next }));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.generic"));
    }
  }

  return (
    <Screen title={t("settings.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !current ? <LoadingBlock /> : null}
      {loaded.error && !current ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {current ? (
        <>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("settings.sub")}</T>
          <List>
            <Row title={t("settings.allow")} sub={current.returnsAllowed ? t("settings.allowOn", { days: current.returnWindowDays }) : t("settings.allowOff")} right={<Toggle on={current.returnsAllowed} label={t("settings.allow")} onChange={(on) => void save({ ...current, returnsAllowed: on })} />} />
          </List>
          {current.returnsAllowed ? (
            <>
              <View style={{ gap: 8 }}>
                <T weight="bold" style={{ fontSize: 15 }}>{t("settings.window")}</T>
                <Chips>
                  {WINDOWS.map((days) => <Seg key={days} label={t("settings.days", { days })} on={current.returnWindowDays === days} onPress={() => void save({ ...current, returnWindowDays: days })} />)}
                </Chips>
              </View>
              <View style={{ gap: 8 }}>
                <T weight="bold" style={{ fontSize: 15 }}>{t("settings.payer")}</T>
                <Chips>
                  <Seg label={t("settings.payer.customer")} on={current.returnShippingPayer !== "seller"} onPress={() => void save({ ...current, returnShippingPayer: "customer" })} />
                  <Seg label={t("settings.payer.seller")} on={current.returnShippingPayer === "seller"} onPress={() => void save({ ...current, returnShippingPayer: "seller" })} />
                </Chips>
              </View>
            </>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          {saved ? <T weight="bold" style={{ color: colors.success }}>{t("settings.saved")}</T> : null}
        </>
      ) : null}
    </Screen>
  );
}
