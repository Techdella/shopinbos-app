import { Linking, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { AppIconName } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { LanguageRow } from "@/components/LanguagePicker";
import { confirmSignOut } from "@/components/partner";
import { useHelpSection } from "@/components/PartnerMore";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

// The delivery partner's menu, opened from "Menu" on Today (the app has four tabs: Today, Jobs, Riders, Money).
// "app:" paths are screens in the app, "url:" a public page, "mailto:" the mail app; nothing opens the web console.

type Row = { label: string; icon: AppIconName; path: string; hint?: string };
type MenuKey = "messages" | "quotes" | "coverage" | "notifications" | "verification" | "profile" | "connect";

// Words in m_partner "menu.<key>" / "menu.<key>Hint" (English: "Connect your system", …).
const SECTIONS: { title: "work" | "company"; links: { key: MenuKey; icon: AppIconName; path: string }[] }[] = [
  {
    title: "work",
    links: [
      { key: "messages", icon: "chat", path: "app:/logistics/messages" },
      { key: "quotes", icon: "tag", path: "app:/logistics/quotes" },
      { key: "coverage", icon: "pin", path: "app:/logistics/coverage" },
    ],
  },
  {
    title: "company",
    links: [
      { key: "notifications", icon: "bell", path: "app:/notifications" },
      { key: "verification", icon: "shield", path: "app:/logistics/verification" },
      { key: "profile", icon: "store", path: "app:/logistics/profile" },
      { key: "connect", icon: "send", path: "app:/logistics/connect" },
    ],
  },
];

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else if (path.startsWith("url:")) void WebBrowser.openBrowserAsync(path.slice(4));
  else if (path.startsWith("mailto:")) void Linking.openURL(path);
}

export function LogisticsMenu() {
  const t = useT("m_partner", "common");
  const help = useHelpSection();
  const sections: { title: string; links: Row[] }[] = SECTIONS.map((section) => ({
    title: t(`menu.${section.title}`),
    links: section.links.map((link) => ({ label: t(`menu.${link.key}`), hint: t(`menu.${link.key}Hint`), icon: link.icon, path: link.path })),
  }));
  return (
    <Screen title={t("menu.title")}>
      {[...sections, help].map((section) => (
        <View key={section.title}>
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 14, marginBottom: 6, marginLeft: 4 }}>{section.title}</T>
          <Card style={{ paddingVertical: 2 }}>
            {section.links.map((link, index) => (
              <LinkRow key={link.label} first={index === 0} icon={link.icon} label={link.label} hint={link.hint} onPress={() => go(link.path)} />
            ))}
          </Card>
        </View>
      ))}
      <Card style={{ paddingVertical: 2 }}>
        <LanguageRow first />
      </Card>
      <LinkButton title={t("logOut")} color={colors.danger} onPress={() => confirmSignOut()} />
      <DeleteAccountButton />
    </Screen>
  );
}
