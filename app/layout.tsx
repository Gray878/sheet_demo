import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bendwell Health Plan",
  description: "A health assessment funnel with server-side results and PayPal subscription unlock."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
