import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppBar, TabBar } from "@/components/AppChrome";
import { BRAND_TITLE, BRAND_TAGLINE, THEME_PRIMARY } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: BRAND_TAGLINE,
  // Lets iOS treat an installed shortcut as a standalone app, and keeps the
  // status bar legible against the maroon app bar.
  appleWebApp: {
    capable: true,
    title: BRAND_TITLE,
    statusBarStyle: "black-translucent",
  },
};

// viewportFit: "cover" lets the page paint into the notch area; the safe-area
// insets in globals.css keep content clear of it.
export const viewport: Viewport = {
  themeColor: THEME_PRIMARY,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppBar />
        <main className="app-shell">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
