// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { createRef, type RefObject } from "react";

export type CadRoutes = Map<string, { x: number; y: number; z: number }[]>;
export type CadBridge = {
  viewport: RefObject<HTMLDivElement | null>;
  camera: RefObject<HTMLDivElement | null>;
  surface: RefObject<HTMLDivElement | null>;
  routes: CadRoutes;
};
export function createCadBridge(): CadBridge {
  return {
    viewport: createRef(),
    camera: createRef(),
    surface: createRef(),
    routes: new Map(),
  };
}
