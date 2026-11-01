import type { Metadata } from "next";
import SoundSandbox from "@/components/sound-sandbox/SoundSandbox";

export const metadata: Metadata = {
  title: "Project CAD – Sound sandbox",
  description:
    "Try subtle sound feedback while placing and connecting process equipment.",
};

export default function SoundSandboxPage() {
  return <SoundSandbox />;
}
