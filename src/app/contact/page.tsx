// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import PublicPage from "@/components/site/PublicPage";
import { contactDetails } from "@/components/site/contact-details";
import styles from "@/components/site/PublicPage.module.css";

export const metadata: Metadata = {
  title: "Contact – Project CAD",
  description:
    "Contact Laszlo Edgar Dobra with questions, feedback, or privacy and accessibility requests about Project CAD.",
};

export default function ContactPage() {
  return (
    <PublicPage
      current="/contact"
      title="Let’s talk."
      intro="Questions about Project CAD, an idea to share, or something getting in your way? Get in touch."
    >
      <div className={styles.contactCard}>
        <h2>{contactDetails.name}</h2>
        <a
          href={`mailto:${contactDetails.email}`}
          className={styles.contactButton}
        >
          <Mail size={18} aria-hidden="true" />
          {contactDetails.email}
        </a>
      </div>
      <section aria-labelledby="help">
        <h2 id="help">Help with the product</h2>
        <p>
          For a product issue, include the page and a short description of what
          happened. Please avoid sending passwords, API keys, or confidential
          project data. The email link opens your email application.
        </p>
        <p>
          For data requests, see the <Link href="/privacy">privacy policy</Link>
          . To report an access barrier, see the{" "}
          <Link href="/accessibility">accessibility page</Link>.
        </p>
      </section>
    </PublicPage>
  );
}
