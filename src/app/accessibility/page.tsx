// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/site/PublicPage";
import { contactDetails, policyDate } from "@/components/site/contact-details";

export const metadata: Metadata = {
  title: "Accessibility – Project CAD",
  description:
    "Motion controls, keyboard access, known limitations, and how to report an accessibility barrier in Project CAD.",
};

export default function AccessibilityPage() {
  return (
    <PublicPage
      current="/accessibility"
      title="Accessibility"
      intro="You should be able to explore and use Project CAD at your own pace. Accessibility is an ongoing part of improving the product."
      updated={policyDate}
    >
      <section aria-labelledby="motion">
        <h2 id="motion">Control the landing-page story</h2>
        <ul>
          <li>Use Pause motion to pause the animated demonstration.</li>
          <li>
            Enable reduced motion in your device settings for a simplified story
            without the animated cursor and camera journey.
          </li>
          <li>
            Use the Design, Build, and Explore controls to choose a chapter.
          </li>
          <li>
            The first keyboard link lets you skip the story. You can also{" "}
            <Link href="/workspace?home=1" prefetch={false}>
              open the workspace directly
            </Link>
            .
          </li>
        </ul>
      </section>
      <section aria-labelledby="keyboard">
        <h2 id="keyboard">Keyboard and reading support</h2>
        <p>
          The website uses headings, named controls, and visible focus
          indicators. Use Tab and Shift+Tab to move between links and controls,
          Enter to follow a link, and Enter or Space to activate a button. These
          information pages support browser zoom and reflow on smaller screens.
        </p>
      </section>
      <section aria-labelledby="progress">
        <h2 id="progress">What still needs improvement</h2>
        <p>
          WCAG 2.2 Level AA is the accessibility target, not a claim that every
          part of the product currently conforms. Interactive flowsheets, canvas
          content, and 3D equipment views may not provide equivalent access for
          all assistive technologies. Text and numeric project controls provide
          other ways to inspect parts of a process, but do not replace every
          visual interaction.
        </p>
      </section>
      <section aria-labelledby="feedback">
        <h2 id="feedback">Report a barrier or request help</h2>
        <p>
          Contact {contactDetails.name} at{" "}
          <a
            href={`mailto:${contactDetails.email}?subject=Project%20CAD%20accessibility`}
          >
            {contactDetails.email}
          </a>{" "}
          if you cannot access a page or complete an action. Include the page,
          what you were trying to do, and, if useful, your browser or assistive
          technology. You do not need to share medical information.
        </p>
        <p>
          You can also use the <Link href="/contact">contact page</Link> to
          request information in another format.
        </p>
      </section>
    </PublicPage>
  );
}
