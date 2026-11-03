// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { ReactNode } from "react";
import { MessageCircle, Minus } from "lucide-react";
import styles from "../AssistantPanel.module.css";

/** The glyph changes with the visible surface, rather than the click state. */
export default function AssistantToggleIcon({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <>
      <span
        className={styles.toggleClosedIcon}
        data-toggle-icon="chat"
        aria-hidden
      >
        {children ?? <MessageCircle size={18} strokeWidth={1.9} />}
      </span>
      <span
        className={styles.toggleOpenIcon}
        data-toggle-icon="minimize"
        aria-hidden
      >
        <Minus size={18} strokeWidth={1.8} />
      </span>
    </>
  );
}
