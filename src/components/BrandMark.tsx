// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { EquipmentPanelIcon } from "./EquipmentIcon";

/** The equipment-menu mark shared by the landing page and application. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return <EquipmentPanelIcon size={size} />;
}
