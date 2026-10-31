import type { Metadata } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist";
import "./globals.css";
import "./themes.css";
export const metadata: Metadata = {
  title: "Project CAD – Home",
  description:
    "A local-first process engineering sandbox with deterministic ideal models and an illustrative 3D view.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
