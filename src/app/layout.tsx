import type { Metadata } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist";
import "./globals.css";
export const metadata: Metadata = {
  title: "Project CAD — Process workspace",
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
