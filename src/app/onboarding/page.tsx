import { redirect } from "next/navigation";

export default function Page() {
  redirect("/workspace?home=1");
}
