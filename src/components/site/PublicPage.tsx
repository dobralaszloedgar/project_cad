// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import SiteLinks from "./SiteLinks";
import styles from "./PublicPage.module.css";

export default function PublicPage({
  title,
  intro,
  current,
  updated,
  children,
}: {
  title: string;
  intro: string;
  current: "/privacy" | "/terms" | "/accessibility" | "/contact";
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page} data-theme="light" data-palette="light">
      <a href="#page-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" prefetch={false} className={styles.brand}>
          <BrandMark />
          <span>Project CAD</span>
        </Link>
        <Link
          href="/workspace?home=1"
          prefetch={false}
          className={styles.workspaceLink}
        >
          Open workspace <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </header>
      <main id="page-content" className={styles.main} tabIndex={-1}>
        <Link href="/" prefetch={false} className={styles.backLink}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to the story
        </Link>
        <div className={styles.heading}>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          {updated ? (
            <p className={styles.updated}>Last updated {updated}</p>
          ) : null}
        </div>
        <div className={styles.content}>{children}</div>
      </main>
      <footer className={styles.footer}>
        <span>Design. Build. Explore.</span>
        <SiteLinks current={current} />
      </footer>
    </div>
  );
}
