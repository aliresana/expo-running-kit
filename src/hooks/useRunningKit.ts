import { useState, useRef } from "react";
import RunningKit from "../RunningKitModule";
import { toDisplayDistance, formatPace, useLocation } from "./useLocation";
import { useSession } from "./useSession";
import { useAutoPause } from "./useAutoPause";
import type {
  WorkoutType,
  Lap,
  SessionSummary,
  RunningKitConfig,
  PermissionsResult,
} from "../RunningKit.types";

const MIN_PACE_SPEED = 0.5; // m/s — below this pace is meaningless

export function useRunningKit(config: RunningKitConfig = {}) {
  const {
    units = "metric",
    autoPause = false,
    autoPauseDelay = 1,
    resumeThreshold = 30,
    speedSmoothingWindow = 5,
  } = config;

  const [laps, setLaps] = useState<Lap[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const lapStartDistanceRef = useRef(0);
  const lapStartTimeRef = useRef(0);

  const { sessionState, sessionStateRef, duration, durationRef, resetSession } =
    useSession();

  const {
    gpsQuality,
    distanceMeters,
    speedStats,
    paceStats,
    maxSpeedRef,
    bestPaceMsRef,
    resetLocation,
    steps,
    distanceRef,
  } = useLocation({
    units,
    speedSmoothingWindow,
    durationRef,
  });

  const { cancelAutoPause } = useAutoPause({
    enabled: autoPause,
    cadence: steps.cadence,
    sessionState,
    sessionStateRef,
    delay: autoPauseDelay,
    resumeThreshold,
  });

  // --- Actions ---

  async function requestPermissions(): Promise<PermissionsResult> {
    return RunningKit.requestPermissions();
  }

  async function startWorkout(type: WorkoutType) {
    setSummary(null);
    setLaps([]);
    lapStartDistanceRef.current = 0;
    lapStartTimeRef.current = 0;
    resetSession();
    resetLocation();
    await RunningKit.startWorkout(type);
  }

  function pauseWorkout() {
    cancelAutoPause();
    RunningKit.pauseWorkout();
  }

  function resumeWorkout() {
    RunningKit.resumeWorkout();
  }

  function recordLap() {
    const lapDistanceMeters = distanceMeters - lapStartDistanceRef.current;
    const lapDuration = duration - lapStartTimeRef.current;
    const lapAvgMs = lapDuration > 0 ? lapDistanceMeters / lapDuration : 0;

    const newLap: Lap = {
      number: laps.length + 1,
      duration: lapDuration,
      distance: toDisplayDistance(lapDistanceMeters, units),
      avgSpeed: lapAvgMs,
      avgPace: lapAvgMs > 0 ? formatPace(lapAvgMs, units) : null,
    };

    setLaps((prev) => [...prev, newLap]);
    lapStartDistanceRef.current = distanceRef.current;
    lapStartTimeRef.current = duration;
  }

  async function stopWorkout(): Promise<SessionSummary> {
    cancelAutoPause();
    const result = await RunningKit.stopWorkout();
    const avgMs = result.duration > 0 ? result.distance / result.duration : 0;

    const finalSummary: SessionSummary = {
      duration: Math.floor(result.duration), // ← floor here too
      distance: toDisplayDistance(result.distance, units),
      steps: result.steps,
      speed: {
        current: 0,
        avg: avgMs,
        max: maxSpeedRef.current,
      },
      pace: {
        current: null,
        avg: avgMs >= MIN_PACE_SPEED ? formatPace(avgMs, units) : null,
        best:
          bestPaceMsRef.current >= MIN_PACE_SPEED
            ? formatPace(bestPaceMsRef.current, units)
            : null,
      },
      calories: result.calories,
      laps,
    };

    setSummary(finalSummary);
    return finalSummary;
  }

  return {
    sessionState,
    duration,
    summary,
    gpsQuality,
    distance: toDisplayDistance(distanceMeters, units),
    speed: speedStats,
    pace: paceStats,
    steps: steps,
    laps,
    recordLap,
    requestPermissions,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    stopWorkout,
  };
}
