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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0c3b2c" },
    { media: "(prefers-color-scheme: dark)", color: "#0a2c21" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
