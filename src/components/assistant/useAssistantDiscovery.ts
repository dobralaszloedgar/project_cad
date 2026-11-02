"use client";

import { useCallback, useEffect, useState } from "react";
import { ASSISTANT_ENDPOINT, ASSISTANT_VERSION } from "@/assistant/protocol";

export type AssistantAvailability = "checking" | "unavailable" | "available";

/** Discover the local app without opening a popup or requesting a session. */
export function useAssistantDiscovery(enabled: boolean) {
  const [availability, setAvailability] =
    useState<AssistantAvailability>("checking");
  const [checking, setChecking] = useState(true);
  const [outdated, setOutdated] = useState(false);
  const [previouslyDetected, setPreviouslyDetected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const checkAgain = useCallback(() => {
    setChecking(true);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;

    const check = async () => {
      if (pending || document.hidden) return;
      clearTimeout(timer);
      pending = true;
      try {
        const response = await fetch(`${ASSISTANT_ENDPOINT}/health`, {
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.any([
            controller.signal,
            // First contact can display the browser's local-network permission
            // prompt. Cancelling after 1.8 s makes a running app look absent.
            AbortSignal.timeout(30000),
          ]),
        });
        const health: unknown = response.ok ? await response.json() : null;
        const available =
          !!health &&
          typeof health === "object" &&
          "name" in health &&
          health.name === "Project CAD assistant" &&
          "version" in health &&
          health.version === ASSISTANT_VERSION;
        if (!controller.signal.aborted) {
          setAvailability(available ? "available" : "unavailable");
          setOutdated(
            available &&
              !(
                "capabilities" in health &&
                Array.isArray(health.capabilities) &&
                health.capabilities.includes("desktop-consent-v1") &&
                health.capabilities.includes("muse-connector-v1")
              ),
          );
          if (available) setPreviouslyDetected(true);
        }
      } catch {
        if (!controller.signal.aborted) setAvailability("unavailable");
      } finally {
        pending = false;
        if (!controller.signal.aborted) {
          setChecking(false);
          timer = setTimeout(check, 3000);
        }
      }
    };
    const resume = () => {
      if (!document.hidden) void check();
    };
    void check();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled, attempt]);

  return { availability, checking, previouslyDetected, outdated, checkAgain };
}
