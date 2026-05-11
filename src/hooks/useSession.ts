import { useEffect, useRef, useState } from "react";
import { useEvent } from "expo";
import RunningKit from "../RunningKitModule";
import type { SessionState } from "../RunningKit.types";

export function useSession() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [duration, setDuration] = useState(0);
  const sessionStateRef = useRef<SessionState>("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const sessionStatePayload = useEvent(RunningKit, "onSessionStateChange");

  useEffect(() => {
    if (!sessionStatePayload?.state) return;
    sessionStateRef.current = sessionStatePayload.state;
    setSessionState(sessionStatePayload.state);
  }, [sessionStatePayload]);

  useEffect(() => {
    if (sessionState === "active") {
      timerRef.current = setInterval(() => {
        setDuration((d) => {
          const next = d + 1;
          durationRef.current = next; // ← add this line
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionState]);

  function resetSession() {
    setDuration(0);
    setSessionState("idle");
    sessionStateRef.current = "idle";
  }

  return { sessionState, sessionStateRef, duration, durationRef, resetSession };
}
