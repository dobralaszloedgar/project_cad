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
      initialView={initialView}
      initialPlayback={query.play !== "0"}
      initialArrange={query.arrange === "1"}
    />
  );
}
