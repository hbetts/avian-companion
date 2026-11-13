import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Analytics } from "@vercel/analytics/next";

const caveat = localFont({ src: "./fonts/Caveat.ttf", variable: "--font-caveat", display: "swap" });

const station = process.env.NEXT_PUBLIC_STATION_NAME || "the window";

export const metadata: Metadata = {
  title: { default: "Visitors", template: "%s · Visitors" },
  description: `The birds heard near ${station}: what the frame shows, in more detail.`,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Visitors", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e6" },
    { media: "(prefers-color-scheme: dark)", color: "#17181c" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${caveat.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
