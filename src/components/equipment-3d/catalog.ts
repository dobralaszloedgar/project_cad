import type { Kind } from "@/domain/schema";

export type EquipmentDetail = {
  title: string;
  tag: string;
  assembly: string;
  description: string;
  color: string;
  height: number;
  features: [string, string][];
  section: string;
};

export const equipmentCatalog: Record<Kind, EquipmentDetail> = {
  Feed: {
    title: "Feed",
    tag: "F-101",
    assembly: "Feed supply tank",
    description:
      "A dedicated supply vessel with a conical roof and a valved discharge line.",
    color: "#367f70",
    height: 2.8,
    features: [
      ["Storage vessel", "Welded shell, conical roof and vent"],
      ["Discharge assembly", "Flanged outlet and isolation valve"],
      ["Level indication", "External sight glass and scale"],
    ],
    section: "Open the shell to reveal the liquid inventory and outlet pickup.",
  },
  Product: {
    title: "Product",
    tag: "P-101",
    assembly: "Product receiver",
    description:
      "A horizontal collection vessel on twin saddles, with a top inspection hatch.",
    color: "#367f70",
    height: 2.2,
    features: [
      ["Receiver drum", "Horizontal shell with dished ends"],
      ["Saddle supports", "Bolted feet on a structural skid"],
      ["Service fittings", "Pressure gauge, hatch and drain"],
    ],
    section: "Reveal the collection volume inside the receiver drum.",
  },
  Mixer: {
    title: "Mixer",
    tag: "M-101",
    assembly: "Centrifugal inline mixer",
    description:
      "A compact horizontal drive and polished mixing bowl, with an axial feed and upright discharge.",
    color: "#367f70",
    height: 2.5,
    features: [
      ["Drive assembly", "Horizontal finned motor and coupling bell"],
      ["Mixing internals", "Rotating bowl and stationary liquid pickup"],
      ["Process connections", "Axial feed, dosing branch and upper discharge"],
    ],
    section:
      "Inspect the horizontal spindle, bowl vanes and stationary pickup.",
  },
  Splitter: {
    title: "Splitter",
    tag: "S-101",
    assembly: "Distribution manifold",
    description:
      "One inlet divides into two individually valved outlet branches on a compact skid.",
    color: "#367f70",
    height: 2.15,
    features: [
      ["Branch manifold", "One inlet, two material outlets"],
      ["Valve assemblies", "Handwheels, stems and bolted flanges"],
      ["Pipe supports", "Anchored stanchions and common base"],
    ],
    section:
      "Cut the pipe walls to reveal liquid inside the branching manifold.",
  },
  Heater: {
    title: "Heater",
    tag: "H-101",
    assembly: "Shell-and-tube heater",
    description:
      "A horizontal heat exchanger with copper-toned utility fittings and a removable channel head.",
    color: "#aa6736",
    height: 2.5,
    features: [
      ["Heat-transfer core", "Tube bundle with transverse baffles"],
      ["Channel heads", "Bolted covers and axial process ports"],
      ["Utility circuit", "Steam inlet and condensate outlet"],
    ],
    section:
      "Expose the tube bundle and the baffles inside the exchanger shell.",
  },
  Cooler: {
    title: "Cooler",
    tag: "C-101",
    assembly: "Air-cooled exchanger",
    description:
      "A finned tube bank beneath twin axial fans, carried by a braced steel frame.",
    color: "#4a83a5",
    height: 2.55,
    features: [
      ["Twin fan deck", "Five-blade rotors with protective guards"],
      ["Finned tube bank", "Parallel process tubes and cooling fins"],
      ["Inlet / outlet headers", "Blue manifolds and flanged connections"],
    ],
    section:
      "Lift away the near-side casing and fan guards to inspect the cooling core.",
  },
  PBR: {
    title: "Packed-bed reactor",
    tag: "R-101",
    assembly: "Fixed-bed catalytic reactor",
    description:
      "A downflow pressure vessel with fine ceramic catalyst packing, liquid distributors and screened bed supports.",
    color: "#a67a43",
    height: 4.25,
    features: [
      ["Catalyst beds", "Small ceramic pellets with inert support layers"],
      [
        "Liquid distribution",
        "Perforated trays, fine screens and a bottom collector",
      ],
      ["Pressure vessel", "Dished heads, bolted cover and welded shell"],
    ],
    section:
      "Inspect both catalyst beds, liquid distributors and outlet collector.",
  },
  Distillation: {
    title: "Distillation column",
    tag: "D-101",
    assembly: "Tray distillation system",
    description:
      "A valve-tray column with an overhead condenser, reflux receiver, controlled reflux split and thermosiphon reboiler.",
    color: "#367f70",
    height: 6.95,
    features: [
      ["Column internals", "Eight trays with alternating downcomers"],
      ["Service access", "Two railed platforms and access ladder"],
      ["Thermal loop", "Overhead condenser and bottom reboiler"],
      ["Reflux circuit", "Receiver, three-way tee and separate branch valves"],
    ],
    section: "Inspect the tray stack and the alternating liquid downcomers.",
  },
};

export const equipmentGroups: { title: string; kinds: Kind[] }[] = [
  { title: "Inputs & outputs", kinds: ["Feed", "Product"] },
  { title: "Mixing & splitting", kinds: ["Mixer", "Splitter"] },
  { title: "Heat transfer", kinds: ["Heater", "Cooler"] },
  { title: "Reaction", kinds: ["PBR"] },
  { title: "Separation", kinds: ["Distillation"] },
];

export const displayKinds = equipmentGroups.flatMap((group) => group.kinds);
