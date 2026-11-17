import type { Metadata } from "next";
// Inter, self-hosted from the npm package so the build and the page make no calls to a font CDN.
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Analysis – sector screener",
  description: "Sector-wise primary stock screen: ROE and ROCE against the industry median, with a separate 5-year profit consistency flag.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
