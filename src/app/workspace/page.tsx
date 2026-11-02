// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import { plantTemplates } from "@/domain/plant-templates";
import { templates } from "@/domain/templates";
import { isPhoneRequest } from "@/lib/workspace-device";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Guard direct links and client navigation before the editor can mount.
  if (isPhoneRequest(await headers())) {
    redirect("/?workspace=desktop-required");
  }
  const query = await searchParams;
  const exampleId = [...templates, ...plantTemplates].find(
    (item) => item.id === query.example,
  )?.id;
  const initialView =
    query.view === "3D" || query.view === "Split" ? query.view : "2D";
  return (
    <Workspace
      exampleId={exampleId}
      initialScreen={query.home === "1" && !exampleId ? "projects" : "editor"}
      initialView={initialView}
      initialPlayback={query.play !== "0"}
      initialArrange={query.arrange === "1"}
    />
  );
}
