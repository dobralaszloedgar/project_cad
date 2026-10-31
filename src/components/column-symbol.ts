import { columnDiagramLayout } from "../domain/column-geometry";

/** A complete column circuit; port IDs retain the editor's existing contract. */
export function columnSymbol(trayCount?: number) {
  const layout = columnDiagramLayout(trayCount);
  const { first, last, height, pitch, trays, feedY, distillateY, bottomsY } =
    layout;
  const path = (d: string, extra = "") => `<path d="${d}" ${extra}/>`;
  const fill = 'fill="var(--pfd-fill,none)"';
  const coil = (x: number, y: number, name: string) =>
    `<g data-column-equipment="${name}"><circle cx="${x}" cy="${y}" r="11" ${fill}/>${path(`M${x - 8} ${y + 4}l5-8 6 8 5-8`)}</g>`;
  const reboilerY = height - 32;
  const body = `<g data-column-tray-count="${layout.count}" stroke-width="1.4">
    <rect class="pfd-body" x="34" y="${first - 20}" width="38" height="${last - first + 40}" rx="16" ${fill}/>
    ${trays.map((y, i) => `<g data-column-tray="${i + 1}">${path(i % 2 ? `M71 ${y}H42v${Math.min(4, pitch / 3)}` : `M35 ${y}H64v${Math.min(4, pitch / 3)}`)}<text x="53" y="${y - 2}" fill="currentColor" stroke="none" text-anchor="middle" font-size="${Math.min(7, pitch * 0.7)}" font-family="monospace">${i + 1}</text></g>`).join("")}
    ${path(`M53 ${first - 20}V22H85`)}
    ${coil(96, 22, "condenser")}
    ${path("M96 33V38")}
    <g data-column-equipment="reflux-receiver"><rect x="86" y="38" width="20" height="12" rx="5" ${fill}/>${path("M89 45H103", 'stroke-width="0.8"')}</g>
    ${path(`M96 50V${distillateY}H79V${first - 9}H72`)}
    <g data-column-equipment="reflux-splitter"><circle cx="96" cy="${distillateY}" r="2" fill="currentColor" stroke="none"/>${path(`M86 ${distillateY - 3}l6 6v-6l-6 6Z`, fill)}</g>
    ${path(`M53 ${last + 20}V${reboilerY}H85M96 ${reboilerY - 11}V${last + 9}H72`)}
    ${coil(96, reboilerY, "reboiler")}
  </g>`;
  const connectors = `<g stroke-width="1.4">
    ${path(`M8 ${feedY}H34`, 'data-port-id="in"')}
    ${path(`M96 ${distillateY}H120`, 'data-port-id="out"')}
    ${path(`M78 ${reboilerY}V${bottomsY}H120`, 'data-port-id="out2"')}
  </g>`;
  return { ...layout, body, connectors };
}
