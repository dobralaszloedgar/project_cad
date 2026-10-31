import type { Metadata, Viewport } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Project CAD — Design. Build. Explore.",
  description:
    "Design a process in conversation. Build and simulate the flowsheet. Explore it in 3D.",
};

export const viewport: Viewport = { themeColor: "#06151f" };

export default function Page() {
  return <LandingPage />;
}
