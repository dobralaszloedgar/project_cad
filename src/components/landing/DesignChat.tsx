// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import DesignChatPanel from "./DesignChatPanel";
import DemoPointer from "./DemoPointer";
import styles from "./DesignChat.module.css";

export default function DesignChat({
  design,
  reduced,
}: {
  design: MotionValue<number>;
  reduced: boolean;
}) {
  const [time, setTime] = useState(design.get());
  const [size, setSize] = useState({
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0,
  });
  const host = useRef<HTMLDivElement>(null);
  useMotionValueEvent(design, "change", (value) =>
    setTime(Math.floor(value * 120) / 120),
  );
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
        centerX: innerWidth / 2 - rect.left,
        centerY: innerHeight / 2 - rect.top,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const open = reduced || time >= 0.2;
  const travel = useTransform(design, [0.05, 0.16], [0, 1], {
    ease: (v) => v * v * (3 - 2 * v),
  });
  const x = useTransform(
    travel,
    (v) => size.centerX + (size.width - 22 - size.centerX) * v,
  );
  const y = useTransform(
    travel,
    (v) =>
      size.centerY +
      (size.height - 22 - size.centerY) * v -
      14 * Math.sin(v * Math.PI),
  );
  const opacity = useTransform(design, [0, 0.025, 0.22, 0.27], [0, 1, 1, 0]);
  const scale = useTransform(
    design,
    [0.18, 0.195, 0.205, 0.23],
    [1, 0.9, 0.9, 1],
  );
  return (
    <div
      ref={host}
      className={styles.demo}
      data-design-chat
      data-expanded={open}
      data-phase={time >= 1 ? "complete" : time >= 0.64 ? "working" : "typing"}
    >
      <section
        id="landing-assistant"
        className={styles.window}
        data-open={open}
        aria-label="Example assistant conversation"
        aria-hidden={!open}
        inert
      >
        <DesignChatPanel time={reduced ? 1 : time} />
      </section>
      <div
        className={styles.launcher}
        data-demo-launcher
        data-open={open}
        aria-hidden="true"
      >
        <MessageCircle size={19} />
      </div>
      {!reduced && size.width > 0 && time < 0.28 && (
        <motion.div
          className={styles.cursor}
          style={{ x, y, opacity, scale }}
          data-demo-cursor
          aria-hidden="true"
        >
          <DemoPointer />
        </motion.div>
      )}
    </div>
  );
}
