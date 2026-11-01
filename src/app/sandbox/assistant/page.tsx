import type { Metadata } from "next";
import AssistantSandbox from "@/components/assistant-sandbox/AssistantSandbox";

export const metadata: Metadata = {
  title: "Project CAD – Assistant sandbox",
  description:
    "Preview the guided assistant download, setup, and connection flow.",
};

export default async function AssistantSandboxPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string | string[] }>;
}) {
  const { scenario } = await searchParams;
  return (
    <AssistantSandbox
      initialScenario={
        scenario === "new" || scenario === "ready" ? scenario : "live"
      }
    />
  );
}
