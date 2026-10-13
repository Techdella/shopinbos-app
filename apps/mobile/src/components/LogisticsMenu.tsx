import { Linking, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { AppIconName } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { confirmSignOut } from "@/components/partner";
import { HELP_SECTION } from "@/components/PartnerMore";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, T } from "@/components/ui";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// The delivery partner's menu, opened from "Menu" on Today (the app has four tabs: Today, Jobs, Riders, Money).
// "app:" paths are screens in the app; anything else opens that page of the web console, signed in.

type Row = { label: string; icon: AppIconName; path: string; hint?: string };

const SECTIONS: { title: string; links: Row[] }[] = [
  {
    title: "Your work",
    links: [
      { label: "Messages", icon: "chat", path: "app:/logistics/messages", hint: "Chats with shops" },
      { label: "Quote requests", icon: "tag", path: "/logistics/quotes", hint: "Shops asking for your price (opens the website)" },
      { label: "Coverage and rates", icon: "pin", path: "/logistics/coverage", hint: "Where you deliver and your prices (opens the website)" },
    ],
  },
  {
    title: "Your company",
    links: [
      { label: "Verification", icon: "shield", path: "app:/logistics/verification", hint: "Your documents, so shops can trust you" },
      { label: "Company profile", icon: "store", path: "/logistics/profile", hint: "Opens the website" },
      { label: "Connect your system", icon: "send", path: "app:/logistics/connect", hint: "Already use delivery software? We connect it for you" },
    ],
  },
];

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else if (path.startsWith("url:")) void WebBrowser.openBrowserAsync(path.slice(4));
  else if (path.startsWith("mailto:")) void Linking.openURL(path);
  else void openWeb(path);
}

export function LogisticsMenu() {
  return (
    <Screen title="Menu">
      {[...SECTIONS, HELP_SECTION].map((section) => (
        <View key={section.title}>
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 14, marginBottom: 6, marginLeft: 4 }}>{section.title}</T>
          <Card style={{ paddingVertical: 2 }}>
            {section.links.map((link, index) => (
              <LinkRow key={link.label} first={index === 0} icon={link.icon} label={link.label} hint={link.hint} onPress={() => go(link.path)} />
            ))}
          </Card>
        </View>
      ))}
      <LinkButton title="Log out" color={colors.danger} onPress={() => confirmSignOut()} />
    </Screen>
  );
}
