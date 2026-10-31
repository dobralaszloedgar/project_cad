import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Project CAD – Design, build, explore",
  description:
    "Design a process in conversation. Build and simulate the flowsheet. Explore it in 3D.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // Keep existing example links working at the new editor address.
  if (typeof query.example === "string") {
    const params = new URLSearchParams();
    for (const key of ["example", "view", "play", "arrange"]) {
      const value = query[key];
      if (typeof value === "string") params.set(key, value);
    }
    redirect(`/workspace?${params}`);
  }
  return <LandingPage />;
}
