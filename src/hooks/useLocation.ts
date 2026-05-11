import { useEffect, useRef, useState } from "react";
import { useEvent } from "expo";
import RunningKit from "../RunningKitModule";
import type {
  GpsQuality,
  PaceStats,
  SpeedStats,
  Units,
} from "../RunningKit.types";

// --- Conversion helpers ---

const M_TO_KM = 0.001;
const M_TO_MI = 0.000621371;

export function toDisplayDistance(meters: number, units: Units): number {
  return units === "metric" ? meters * M_TO_KM : meters * M_TO_MI;
}

export function formatPace(ms: number, units: Units): string | null {
  if (ms <= 0) return null;
  const secPer = units === "metric" ? 1000 / ms : 1609.34 / ms;
  const min = Math.floor(secPer / 60);
  const sec = Math.floor(secPer % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function getGpsQuality(accuracy: number): GpsQuality {
  if (accuracy < 10) return "excellent";
  if (accuracy < 25) return "good";
  if (accuracy < 50) return "fair";
  return "poor";
}

// Haversine formula — accurate distance between two GPS coordinates
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Hook ---

type UseLocationProps = {
  units: Units;
  speedSmoothingWindow: number;
  durationRef: React.MutableRefObject<number>;
};

const MIN_PACE_SPEED = 0.5; // m/s — below this speed pace is meaningless

export function useLocation({
  units,
  speedSmoothingWindow,
  durationRef,
}: UseLocationProps) {
  const [gpsQuality, setGpsQuality] = useState<GpsQuality>("poor");
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [speedStats, setSpeedStats] = useState<SpeedStats>({
    current: 0,
    avg: 0,
    max: 0,
  });
  const [paceStats, setPaceStats] = useState<PaceStats>({
    current: null,
    avg: null,
    best: null,
  });
  const [smoothedSpeedMs, setSmoothedSpeedMs] = useState(0);
  const [steps, setSteps] = useState({ total: 0, cadence: 0 });

  // Refs for mutable accumulation — don't need re-renders
  const distanceRef = useRef(0);
  const lastLatRef = useRef<number | null>(null);
  const lastLonRef = useRef<number | null>(null);
  const speedWindowRef = useRef<number[]>([]);
  const maxSpeedRef = useRef(0);
  const bestPaceMsRef = useRef(0);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locationPayload = useEvent(RunningKit, "onLocationUpdate");
  const stepPayload = useEvent(RunningKit, "onStepUpdate");

  useEffect(() => {
    if (!stepPayload) return;
    setSteps({ total: stepPayload.steps, cadence: stepPayload.cadence });
  }, [stepPayload]);

  useEffect(() => {
    if (!locationPayload) return;
    const { latitude, longitude, speed: rawSpeed, accuracy } = locationPayload;

    // GPS quality — reset to "poor" after 4s with no updates (GPS lost / workout stopped)
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    gpsTimeoutRef.current = setTimeout(() => setGpsQuality("poor"), 4000);
    setGpsQuality(getGpsQuality(accuracy));

    // Distance — only accumulate if user moved > 1m to filter GPS drift noise
    if (lastLatRef.current !== null && lastLonRef.current !== null) {
      const delta = haversineDistance(
        lastLatRef.current,
        lastLonRef.current,
        latitude,
        longitude,
      );
      if (delta > 1) {
        distanceRef.current += delta;
        setDistanceMeters(distanceRef.current);
      }
    }
    lastLatRef.current = latitude;
    lastLonRef.current = longitude;

    // Speed smoothing — rolling average
    const window = speedWindowRef.current;
    window.push(rawSpeed);
    if (window.length > speedSmoothingWindow) window.shift();
    const smoothedMs = window.reduce((a, b) => a + b, 0) / window.length;
    setSmoothedSpeedMs(smoothedMs);

    // Max speed
    if (smoothedMs > maxSpeedRef.current) maxSpeedRef.current = smoothedMs;

    // Avg speed — use ref for duration to avoid stale closure
    const currentDuration = durationRef.current;
    const avgMs =
      currentDuration > 0 ? distanceRef.current / currentDuration : 0;

    // Best pace — highest speed seen above threshold
    if (smoothedMs >= MIN_PACE_SPEED && smoothedMs > bestPaceMsRef.current) {
      bestPaceMsRef.current = smoothedMs;
    }

    setSpeedStats({
      current: smoothedMs,
      avg: avgMs,
      max: maxSpeedRef.current,
    });

    setPaceStats({
      current:
        smoothedMs >= MIN_PACE_SPEED ? formatPace(smoothedMs, units) : null,
      avg: avgMs > 0 ? formatPace(avgMs, units) : null,
      best:
        bestPaceMsRef.current > 0
          ? formatPace(bestPaceMsRef.current, units)
          : null,
    });
  }, [locationPayload]);

  function resetLocation() {
    distanceRef.current = 0;
    lastLatRef.current = null;
    lastLonRef.current = null;
    speedWindowRef.current = [];
    maxSpeedRef.current = 0;
    bestPaceMsRef.current = 0;
    if (gpsTimeoutRef.current) {
      clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current = null;
    }
    setDistanceMeters(0);
    setGpsQuality("poor");
    setSmoothedSpeedMs(0);
    setSpeedStats({ current: 0, avg: 0, max: 0 });
    setPaceStats({ current: null, avg: null, best: null });
    setSteps({ total: 0, cadence: 0 });
  }

  return {
    gpsQuality,
    distanceMeters,
    distanceRef,
    speedStats,
    paceStats,
    smoothedSpeedMs,
    maxSpeedRef,
    bestPaceMsRef,
    steps,
    resetLocation,
  };
}
