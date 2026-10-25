import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter/wght-italic.css";
import "./globals.css";
import "./gallery-controls.css";
import "./public-navigation.css";
import {archiveMetadata} from "./archive-metadata";

export const metadata: Metadata = archiveMetadata();

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
