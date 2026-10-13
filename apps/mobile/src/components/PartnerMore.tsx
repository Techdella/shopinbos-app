import { Linking, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { AppIconName } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { LanguageRow } from "@/components/LanguagePicker";
import { confirmSignOut } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, LinkButton, T } from "@/components/ui";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// The More tab for suppliers and delivery partners. "app:" paths are screens in the app, "url:" opens a public
// page, "mailto:" the mail app; anything else opens that page of the web portal, signed in.

export type MoreLink = { label: string; icon: AppIconName; path: string; hint?: string };

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else if (path.startsWith("url:")) void WebBrowser.openBrowserAsync(path.slice(4));
  else if (path.startsWith("mailto:")) void Linking.openURL(path);
  else void openWeb(path);
}

export const HELP_SECTION: { title: string; links: MoreLink[] } = {
  title: "Help and legal",
  links: [
    { label: "Email support", icon: "help", path: "mailto:support@shopinbos.com", hint: "support@shopinbos.com" },
    { label: "Terms", icon: "doc", path: "url:https://shopinbos.com/terms" },
    { label: "Privacy", icon: "doc", path: "url:https://shopinbos.com/privacy", hint: "How we handle your data under the NDPA" },
  ],
};

export function PartnerMore({ sections }: { sections: Array<{ title: string; links: MoreLink[] }> }) {
  return (
    <TabScreen title="More">
      {[...sections, HELP_SECTION].map((section) => (
        <View key={section.title} style={{ marginBottom: 14 }}>
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 12.5, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6, marginLeft: 4 }}>{section.title}</T>
          <Card style={{ paddingVertical: 2 }}>
            {section.links.map((link, index) => (
              <LinkRow key={link.label} first={index === 0} icon={link.icon} label={link.label} hint={link.hint} onPress={() => go(link.path)} />
            ))}
          </Card>
        </View>
      ))}
      <Card style={{ paddingVertical: 2, marginBottom: 14 }}>
        <LanguageRow first />
      </Card>
      <LinkButton title="Log out" color={colors.danger} onPress={() => confirmSignOut()} />
    </TabScreen>
  );
}
