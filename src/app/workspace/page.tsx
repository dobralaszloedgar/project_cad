import Workspace from "@/components/Workspace";
import { plantTemplates } from "@/domain/plant-templates";
import { templates } from "@/domain/templates";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
      initialPlayback={query.play === "1"}
      initialArrange={query.arrange === "1"}
    />
  );
}
