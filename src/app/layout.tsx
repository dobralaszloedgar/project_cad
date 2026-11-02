// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Metadata } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/figtree/wght-italic.css";
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
