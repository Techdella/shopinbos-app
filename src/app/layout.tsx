import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ClientLayout } from "@/components/ClientLayout";
import { AppSessionGuard } from "@/components/AppSessionGuard";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getClientMessages, getLocale } from "@/lib/i18n/server";
import { isAppSession } from "@/lib/app-session.server";
import "./fonts.css";
import "./globals.css";

// Fonts are self-hosted from public/fonts (src/app/fonts.css), not next/font/google: the build-time download from
// Google Fonts failed now and then and broke deploys. .sib-fonts sets the same variables next/font used to.

export const metadata: Metadata = {
  title: {
    default: "Shopinbos Business",
    template: "%s · Shopinbos Business",
  },
  description: "AI commerce operating system for African businesses. Build your store, source products, and grow with AI.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com"),
  // icon.tsx and apple-icon.tsx in this directory are picked up automatically
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // App language (shared/i18n): the sib_lang cookie, else Accept-Language. Pidgin is lang="pcm".
  const [locale, messages, inApp] = await Promise.all([getLocale(), getClientMessages(), isAppSession()]);
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className="sib-fonts h-full"
      // Opened from the phone app: nothing that sells a digital item shows (src/lib/app-session.ts).
      {...(inApp ? { "data-in-app": "1" } : {})}
    >
      <head>
        <link rel="preload" href="/fonts/plus-jakarta-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/space-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full">
        <I18nProvider locale={locale} messages={messages}>
          <ClientLayout>{children}</ClientLayout>
          {inApp ? <AppSessionGuard /> : null}
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
