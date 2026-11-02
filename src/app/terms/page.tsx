// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/site/PublicPage";
import { policyDate } from "@/components/site/contact-details";

export const metadata: Metadata = {
  title: "Terms of use – Project CAD",
  description:
    "Responsible use, engineering limitations, project ownership, and connected services in Project CAD.",
};

export default function TermsPage() {
  return (
    <PublicPage
      current="/terms"
      title="Terms of use"
      intro="Project CAD helps you explore process ideas, work with models, and inspect illustrative 3D views. These terms explain the intended use and its limits."
      updated={policyDate}
    >
      <section id="engineering" aria-labelledby="engineering-heading">
        <h2 id="engineering-heading">Engineering models have limits</h2>
        <p>
          Calculations depend on the selected thermodynamic model, chemical
          property data, equipment assumptions, numerical methods, and your
          inputs. A converged calculation does not establish that a process is
          safe, feasible, or suitable for construction or operation.
        </p>
        <p>
          Independently verify inputs and results with appropriate engineering
          methods and qualified review before using them for real equipment,
          operating decisions, or regulatory submissions. The 3D views are
          illustrative; they are not fabrication drawings, a safety assessment,
          or a certification. Project CAD does not replace professional
          engineering judgment.
        </p>
      </section>
      <section aria-labelledby="ai">
        <h2 id="ai">AI-generated suggestions</h2>
        <p>
          AI output can be incomplete or incorrect. Review proposed changes,
          calculations, and tool actions before relying on them. Choose an
          access mode appropriate for the files and tools available in your
          project. You are responsible for the information you choose to send
          and the actions you authorize.
        </p>
        <p>
          Connected providers have their own accounts, terms, usage limits, and
          charges. The landing-page conversation is a demonstration, not a
          promise of a particular result. See the{" "}
          <Link href="/privacy#ai-assistant">AI data-use notice</Link> before
          connecting a provider.
        </p>
      </section>
      <section aria-labelledby="projects">
        <h2 id="projects">Your projects and permissions</h2>
        <p>
          You retain the rights you hold in your project content. Using Project
          CAD does not transfer ownership of that content. Only import, use, or
          share files and information you have permission to use, including
          information sent to connected services.
        </p>
        <p>
          Keep backups of important work. Saving to a local folder or browser
          storage is not a managed backup service. Browser data can be cleared,
          folder access can expire, and changes made by authorized tools can
          affect project files.
        </p>
      </section>
      <section aria-labelledby="responsible-use">
        <h2 id="responsible-use">Responsible use</h2>
        <p>
          Use the website and software lawfully. Do not access another
          person&apos;s files or accounts without authorization, bypass access
          controls, or disrupt the service. Respect the licenses and rights that
          apply to software, chemical data, and other materials you use.
        </p>
        <p>
          These terms do not grant ownership of the Project CAD software or
          third-party materials. Separate licenses may apply to included
          components; the assistant&apos;s{" "}
          <a href="/assistant-licenses.txt">third-party license notices</a> are
          available to read.
        </p>
      </section>
      <section aria-labelledby="availability">
        <h2 id="availability">Availability and responsibility</h2>
        <p>
          Features, data sources, and external services may change or become
          unavailable. Continuous availability, error-free calculations, and
          suitability for a particular engineering purpose are not guaranteed.
          Evaluate the software and its outputs for your intended use.
        </p>
        <p>
          Nothing in these terms excludes rights or protections that cannot be
          excluded under applicable law.
        </p>
      </section>
      <section aria-labelledby="changes">
        <h2 id="changes">Changes and questions</h2>
        <p>
          Updated terms will appear on this page with a revised date. Separate
          agreements presented for a particular service may also apply to that
          service. For questions about these terms, use the{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </section>
    </PublicPage>
  );
}
