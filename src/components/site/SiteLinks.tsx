// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import Link from "next/link";
import styles from "./SiteLinks.module.css";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/contact", label: "Contact" },
] as const;

export default function SiteLinks({
  current,
  className = "",
}: {
  current?: (typeof links)[number]["href"];
  className?: string;
}) {
  return (
    <nav
      className={`${styles.links} ${className}`}
      aria-label="Site information"
    >
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={current === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
