import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const instrument = localFont({
  src: "./fonts/InstrumentSans-Variable.woff2",
  variable: "--font-instrument",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "byTeam", template: "%s | byTeam" },
  description: "Attendance, leave and payroll for the office.",
  // Lets "Add to Home Screen" on an iPhone open byTeam full screen, without Safari's bars. The status bar stays
  // light or dark with the page ("default"), so the clock and battery never sit on top of content.
  appleWebApp: { capable: true, title: "byTeam", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Next writes the newer mobile-web-app-capable tag; older iOS versions only read the Apple one.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
