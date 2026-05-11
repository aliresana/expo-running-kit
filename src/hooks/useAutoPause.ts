import { useEffect, useRef } from "react";
import RunningKit from "../RunningKitModule";
import type { SessionState } from "../RunningKit.types";

type UseAutoPauseProps = {
  enabled: boolean;
  cadence: number;
  sessionState: SessionState;
  sessionStateRef: React.MutableRefObject<SessionState>;
  delay: number;
  resumeThreshold: number;
};

export function useAutoPause({
  enabled,
  cadence,
  sessionState,
  sessionStateRef,
  delay,
  resumeThreshold,
}: UseAutoPauseProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const state = sessionStateRef.current;

    // Cadence dropped to zero → start auto-pause countdown
    if (cadence === 0 && state === "active") {
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          RunningKit.autoPauseWorkout();
          timerRef.current = null;
        }, delay * 1000);
      }
    }

    // Movement detected → cancel pending countdown, or auto-resume
    if (cadence >= resumeThreshold) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (state === "auto-paused") {
        RunningKit.resumeWorkout();
      }
    }
  }, [cadence, sessionState]);

  function cancelAutoPause() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  return { cancelAutoPause };
}
