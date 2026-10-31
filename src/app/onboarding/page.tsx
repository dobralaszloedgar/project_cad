import type { Metadata } from "next";
import Onboarding from "@/components/Onboarding";

export const metadata: Metadata = {
  title: "Project CAD – Set up your workspace",
};

export default function Page() {
  return <Onboarding />;
}
