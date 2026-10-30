import type { Metadata, Viewport } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Project CAD — From a thought to a whole new world.",
  description:
    "Describe your process. Watch it become a flowsheet. Explore transparent, animated process equipment in 3D with Project CAD.",
};

export const viewport: Viewport = { themeColor: "#06151f" };

export default function Page() {
  return <LandingPage />;
}
