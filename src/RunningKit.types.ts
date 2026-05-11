// --- Enums ---

export type WorkoutType = "running" | "walking";

export type SessionState =
  | "idle"
  | "active"
  | "paused"
  | "auto-paused"
  | "stopped";

export type GpsQuality = "excellent" | "good" | "fair" | "poor";

export type Units = "metric" | "imperial";

// --- Event Payloads ---

export type LocationUpdatePayload = {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number; // m/s (raw, always metric internally)
  accuracy: number; // meters
  timestamp: number; // unix ms
};

export type StepUpdatePayload = {
  steps: number; // total steps this session
  cadence: number; // steps per minute
};

export type SessionStatePayload = {
  state: SessionState;
};

// --- Events map (native → JS) ---

export type RunningKitEvents = {
  onLocationUpdate: (payload: LocationUpdatePayload) => void;
  onStepUpdate: (payload: StepUpdatePayload) => void;
  onSessionStateChange: (payload: SessionStatePayload) => void;
};

// --- Speed & Pace ---

export type SpeedStats = {
  current: number; // m/s
  avg: number; // m/s
  max: number; // m/s
};

export type PaceStats = {
  current: string | null; // "5:30" format, null when stopped
  avg: string | null;
  best: string | null; // lowest (fastest) pace
};

// --- Laps ---

export type Lap = {
  number: number;
  duration: number;
  distance: number; // km or mi
  avgSpeed: number; // m/s
  avgPace: string | null;
};

// --- Hook Config ---

export type RunningKitConfig = {
  units?: Units;
  autoPause?: boolean;
  autoPauseDelay?: number; // seconds
  resumeThreshold?: number;
  speedSmoothingWindow?: number; // number of samples
};

// --- Function return types ---

export type PermissionStatus = "granted" | "denied" | "undetermined";

export type PermissionsResult = {
  location: PermissionStatus;
  motion: PermissionStatus;
};

export type SessionSummary = {
  duration: number; // seconds
  distance: number; // km or mi
  steps: number;
  speed: SpeedStats;
  pace: PaceStats;
  calories: number; // kcal
  laps: Lap[];
};
