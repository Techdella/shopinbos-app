import type { Metadata } from "next";
import { Space_Grotesk, Fraunces, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ClientLayout } from "@/components/ClientLayout";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getClientMessages, getLocale } from "@/lib/i18n/server";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Shopinbos",
    template: "%s | Shopinbos",
  },
  description: "AI commerce operating system for African businesses. Build your store, source products, and grow with AI.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com"),
  // icon.tsx and apple-icon.tsx in this directory are picked up automatically
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // App language (shared/i18n): the sib_lang cookie, else Accept-Language. Pidgin is lang="pcm".
  const [locale, messages] = await Promise.all([getLocale(), getClientMessages()]);
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${plusJakarta.variable} h-full`}
    >
      <body className="min-h-full">
        <I18nProvider locale={locale} messages={messages}>
          <ClientLayout>{children}</ClientLayout>
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
