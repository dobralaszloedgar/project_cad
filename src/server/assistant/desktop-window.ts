import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Keep the desktop credential and launch ticket entirely on the local host. */
export async function desktopWindow(root: string) {
  const control = JSON.parse(
    await readFile(join(root, "desktop-control.json"), "utf8"),
  );
  if (
    !Number.isInteger(control.port) ||
    control.port < 1024 ||
    control.port > 65535 ||
    typeof control.token !== "string"
  )
    throw new Error("Reopen the connector from your application menu.");
  const origin = `http://127.0.0.1:${control.port}`;
  const response = await fetch(`${origin}/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${control.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "ticket" }),
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Could not open the connector.");
  const value = await response.json();
  const url = new URL(value.url);
  if (url.origin !== origin || url.pathname !== "/open")
    throw new Error("Invalid connector window.");
  return url.href;
}
