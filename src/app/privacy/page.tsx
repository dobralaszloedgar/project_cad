// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/site/PublicPage";
import { contactDetails, policyDate } from "@/components/site/contact-details";

export const metadata: Metadata = {
  title: "Privacy policy – Project CAD",
  description:
    "How Project CAD handles project files, browser storage, optional AI connections, and privacy requests.",
};

export default function PrivacyPage() {
  return (
    <PublicPage
      current="/privacy"
      title="Privacy policy"
      intro="Your project files can live in a folder you choose. Connected services, including AI providers, may process information outside your device. Here is how those parts fit together."
      updated={policyDate}
    >
      <section aria-labelledby="scope">
        <h2 id="scope">What this notice covers</h2>
        <p>
          This notice describes the Project CAD website, browser workspace, and
          optional local assistant connection. For privacy questions or
          requests, contact {contactDetails.name} at{" "}
          <a href={`mailto:${contactDetails.email}`}>{contactDetails.email}</a>.
          Services you connect or visit have their own privacy terms.
        </p>
      </section>
      <section aria-labelledby="information">
        <h2 id="information">Information used by the product</h2>
        <h3>Website visits</h3>
        <p>
          Serving a web page involves connection information such as your IP
          address, browser information, requested URL, and request time. Hosting
          infrastructure may record this information to deliver the website,
          diagnose failures, and protect the service.
        </p>
        <h3>Projects and browser storage</h3>
        <p>
          The workspace saves projects in folders you authorize and uses browser
          storage for recovery copies, preferences, and remembered folder
          access. Folder access is subject to your browser or local connector
          permissions. A folder synchronized by your operating system or another
          application may also be copied by that service.
        </p>
        <h3>Chemical searches and calculations</h3>
        <p>
          Chemical searches and property requests are sent to the application
          server and may be handled by its configured chemical catalog service.
          Calculations run in the browser or, when a server calculation is used,
          on the application server with the project data supplied for that
          request.
        </p>
        <h3>Messages you send us</h3>
        <p>
          If you contact us, your email address, name if supplied, message, and
          attachments are processed by the email service and used to respond to
          your enquiry. Please leave out passwords, API keys, and confidential
          project files unless they are necessary and an appropriate way to
          share them has been agreed.
        </p>
      </section>
      <section id="ai-assistant" aria-labelledby="ai-heading">
        <h2 id="ai-heading">Optional AI connections</h2>
        <p>
          The conversation on the landing page is a scripted demonstration. It
          does not send that example conversation to an AI service.
        </p>
        <p>
          In the workspace, connecting an assistant and sending a message can
          transmit your prompt, relevant conversation history, project context,
          tool results, and attachments to your selected AI provider. Depending
          on the provider and access mode, the assistant may also read files or
          run tools in the connected project folder.
        </p>
        <p>
          The local connector stores conversation and connection information on
          your computer. Local storage does not mean AI processing stays on your
          computer: the selected provider processes requests under its own
          terms, account settings, and retention practices. Review those
          settings before sending sensitive information. You can use the project
          editor without connecting an AI assistant.
        </p>
      </section>
      <section aria-labelledby="tracking">
        <h2 id="tracking">Cookies, storage, and tracking</h2>
        <p>
          The current landing page has no integrated advertising trackers or
          cross-site analytics. The workspace and local assistant use browser
          storage, session information, and, where needed, local authentication
          cookies for product functionality. These are separate from advertising
          cookies.
        </p>
        <p>
          The website does not currently change its behavior in response to a
          browser&apos;s Do Not Track signal. External websites and AI services
          you choose to use may collect information under their own policies.
        </p>
      </section>
      <section aria-labelledby="retention">
        <h2 id="retention">Retention and deletion</h2>
        <p>
          Project files remain in the chosen folder until you remove them.
          Browser copies and preferences remain until cleared by you or your
          browser. Back up work you want to keep before clearing site data.
          Removing browser data does not remove files in your project folder,
          local assistant history, exported copies, or information already sent
          to a provider.
        </p>
        <p>
          Server logs, support messages, and provider-held information have
          separate retention periods that depend on the hosting or service
          settings and any applicable legal obligations. Contact us for details
          or a deletion request about information associated with your use.
        </p>
      </section>
      <section aria-labelledby="choices">
        <h2 id="choices">Your choices and requests</h2>
        <p>
          You can manage folder permissions and site data in your browser,
          remove local files you no longer need, and choose whether to connect
          an AI provider. Provider account controls apply to information sent to
          that provider.
        </p>
        <p>
          Depending on where you live and the law that applies, you may have
          rights to access, correct, delete, or obtain a copy of personal
          information, or to make other privacy choices. Email{" "}
          <a
            href={`mailto:${contactDetails.email}?subject=Project%20CAD%20privacy%20request`}
          >
            {contactDetails.email}
          </a>{" "}
          with your request and the feature you used. Information needed to
          verify the request may be requested; do not send account passwords or
          API keys. Files stored only on your device must be managed there.
        </p>
      </section>
      <section aria-labelledby="children">
        <h2 id="children">Children</h2>
        <p>
          Project CAD is an engineering tool and is not directed to children
          under 13. If you believe a child has provided personal information
          through the service, contact us so the information can be reviewed and
          addressed.
        </p>
      </section>
      <section aria-labelledby="updates">
        <h2 id="updates">Updates and contact</h2>
        <p>
          Changes to this notice will be posted here with an updated date. Any
          additional notice or consent required by applicable law will be
          provided when needed. The current notice is effective {policyDate}.
          You can find contact details on the{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </section>
    </PublicPage>
  );
}
