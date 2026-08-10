import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { Providers } from "@/components/providers";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ordena",
    template: "%s · Ordena",
  },
  description:
    "Ordena comida para recoger. Instala la app y recibe el estado de tu pedido.",
  applicationName: "Ordena",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ordena",
  },
  icons: {
    icon: [
      { url: "/logos/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
    shortcut: "/logos/favicon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Ordena",
    url: siteUrl,
    title: "Ordena",
    description:
      "Ordena comida para recoger. Instala la app y recibe el estado de tu pedido.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ordena",
    description:
      "Ordena comida para recoger. Instala la app y recibe el estado de tu pedido.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
    { media: "(prefers-color-scheme: dark)", color: "#ea580c" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <PwaRegister />
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  );
}
