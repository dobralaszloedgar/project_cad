import type { Kind } from "@/domain/schema";

/** Manufacturer references inform the visual assemblies, not dimensions or
 * certified designs. All geometry is authored locally for this sandbox. */
export const equipmentReferences: Record<
  Kind,
  { name: string; url: string; detail: string; operation: string }
> = {
  Feed: {
    name: "Tank Connection · Storage vessels",
    url: "https://www.tankconnection.com/products/liquid-storage-tanks/petroleum-storage-tank",
    detail:
      "Cone-roof storage form, with low discharge and access fittings. Feed is represented here by a supply vessel.",
    operation:
      "Feed moves from the stored inventory through the low outlet and isolation valve.",
  },
  Product: {
    name: "Paul Mueller · Chemical receivers",
    url: "https://en.paulmueller.com/chemical-processing-equipment/storage-tanks/receiver-vessel",
    detail:
      "Chemical receiver configuration, shown here as a horizontal drum on saddles.",
    operation:
      "Incoming material collects in the receiver and leaves through its low draw-off line.",
  },
  Mixer: {
    name: "SEPARATECH · Centrifugal mixer",
    url: "https://www.separatech.com/products/edible-oil-refinery-plant/centrifugal-mixer/",
    detail:
      "CM exterior and section drawing: horizontal spindle, removable hood, rotating bowl and stationary centripetal pickup.",
    operation:
      "Axial feed enters the rotating bowl. Liquid turns with the bowl and leaves through the fixed pickup and upper discharge. Rotation is slowed for inspection.",
  },
  Splitter: {
    name: "Swagelok · Distribution headers",
    url: "https://www.swagelok.com/downloads/webcatalogs/en/ms-02-358.pdf",
    detail: "Common inlet, separately valved branches and a low drain.",
    operation:
      "Liquid flows through the manifold into two branches. The isolation handwheels stay fixed.",
  },
  Heater: {
    name: "API Heat Transfer · Exchangers",
    url: "https://www.apiheattransfer.com/wp-content/uploads/2024/11/Basco-Shell-And-Tube-Heat-Exchangers_R4.pdf",
    detail: "Tube sheets, segmental baffles, channel heads and utility ports.",
    operation:
      "Liquid runs inside the tubes while a separate steam space surrounds the bundle. Condensate drains from the low utility outlet.",
  },
  Cooler: {
    name: "Alfa Laval · Air heat exchangers",
    url: "https://www.alfalaval.com/en-US/products/heat-transfer/finned-tube-air-heat-exchangers/Finned-tube-air-heat-exchangers/",
    detail:
      "Induced-draft fans above a finned tube bank, with separate fluid headers.",
    operation:
      "Twin motor-driven fans rotate above the finned bank, drawing air upward. The separate process circuit remains inside the tubes.",
  },
  PBR: {
    name: "Johnson Screens · Reactor internals",
    url: "https://johnsonscreens.com/wp-content/uploads/2022/08/Internals-for-Down-Flow-Reactor_Eng.pdf",
    detail:
      "Downflow distributor trays, support grids and outlet collector. Catalyst grains are enlarged for visibility; typical real pellets are 1–5 mm.",
    operation:
      "Liquid spreads over each distributor, trickles through stationary catalyst and drains into the bottom collector.",
  },
  Distillation: {
    name: "Sulzer · Tray technology",
    url: "https://www.sulzer.com/en/shared/products/shell-tray-technology",
    detail:
      "Valve trays and alternating downcomers. Reflux enters above the top tray; reboiler return enters below the bottom tray.",
    operation:
      "Vapor forms fine bubbles in each tray’s liquid layer. Liquid spills through alternating downcomers; the reboiler boils and the condenser forms descending films.",
  },
};
