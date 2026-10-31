import type { Metadata } from "next";
import AssistantSandbox from "@/components/assistant-sandbox/AssistantSandbox";

export const metadata: Metadata = {
  title: "Project CAD – Assistant sandbox",
  description:
    "Preview the guided assistant download, setup, and connection flow.",
};

export default function AssistantSandboxPage() {
  return <AssistantSandbox />;
}
