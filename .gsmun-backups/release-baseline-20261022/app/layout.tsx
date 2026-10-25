import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/inter";
import "./globals.css";
import { siteConfig } from "./site-config";

const socialImage =
  "https://play.mint.gg/experience-assets/complete-shelf/social-card.webp";

export const metadata: Metadata = {
  metadataBase: new URL("https://play.mint.gg/complete-shelf"),
  title: siteConfig.title,
  description: siteConfig.description,
  applicationName: siteConfig.applicationName,
  category: "books",
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    type: "website",
    siteName: siteConfig.applicationName,
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: siteConfig.socialImageAlt,
        type: "image/webp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#eee8db",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
