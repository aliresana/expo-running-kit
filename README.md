# expo-running-kit

A native Expo module for tracking running and walking workouts.
Provides real-time GPS tracking, step counting, pace, cadence, auto-pause/resume, and lap recording — with a single React hook.

## Features

- **GPS tracking** — real-time position, speed, distance (metric or imperial)
- **Pedometer** — step count and cadence (steps per minute)
- **Pace** — current, average, and best pace with configurable units
- **Auto-pause / Auto-resume** — pauses when you stop moving, resumes when you start again
- **Laps** — record splits with per-lap distance, time, and pace
- **GPS quality indicator** — excellent / good / fair / poor
- **iOS & Android** — CoreLocation + CMPedometer on iOS, FusedLocation + StepCounter on Android

---

## Installation

```sh
npx expo install expo-running-kit
```

### iOS

```sh
npx pod-install
```

Add the following keys to your `Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Required to track your workout route.</string>
<key>NSMotionUsageDescription</key>
<string>Required to count your steps and measure cadence.</string>
```

### Android

Add the following permissions to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
```

---

## Quick Start

```tsx
import { useRunningKit } from 'expo-running-kit';

export default function WorkoutScreen() {
  const {
    sessionState,
    duration,
    distance,
    speed,
    pace,
    steps,
    gpsQuality,
    laps,
    summary,
    requestPermissions,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    stopWorkout,
    recordLap,
  } = useRunningKit({ units: 'metric', autoPause: true });

  return (
    // your UI
  );
}
```

---

## API

### `useRunningKit(config?)`

The main hook. Returns live workout data and control functions.

#### Config

| Option | Type | Default | Description |
|---|---|---|---|
| `units` | `'metric' \| 'imperial'` | `'metric'` | Distance in km/mi, pace in min/km or min/mi |
| `autoPause` | `boolean` | `false` | Automatically pause when movement stops |
| `autoPauseDelay` | `number` | `1` | Seconds after cadence drops to zero before pausing |
| `resumeThreshold` | `number` | `30` | Minimum cadence (spm) to trigger auto-resume |
| `speedSmoothingWindow` | `number` | `5` | Number of GPS samples to average for speed |

#### Returned values

| Value | Type | Description |
|---|---|---|
| `sessionState` | `SessionState` | Current workout state |
| `duration` | `number` | Elapsed seconds (only counts while active) |
| `distance` | `number` | Total distance in km or mi |
| `speed` | `SpeedStats` | Current, average, and max speed in m/s |
| `pace` | `PaceStats` | Current, average, and best pace as `"M:SS"` string |
| `steps` | `{ total: number, cadence: number }` | Total steps and cadence (spm) |
| `gpsQuality` | `GpsQuality` | Signal quality: `excellent / good / fair / poor` |
| `laps` | `Lap[]` | Recorded laps |
| `summary` | `SessionSummary \| null` | Final stats after stopping |

#### Control functions

| Function | Description |
|---|---|
| `requestPermissions()` | Request location and motion permissions |
| `startWorkout(type)` | Start a new workout (`'running'` or `'walking'`) |
| `pauseWorkout()` | Manually pause |
| `resumeWorkout()` | Resume from manual or auto-pause |
| `stopWorkout()` | Stop and return `SessionSummary` |
| `recordLap()` | Record a lap split |

---

## Types

```ts
type SessionState = 'idle' | 'active' | 'paused' | 'auto-paused' | 'stopped';

type WorkoutType = 'running' | 'walking';

type GpsQuality = 'excellent' | 'good' | 'fair' | 'poor';

type SpeedStats = {
  current: number; // m/s
  avg: number;     // m/s
  max: number;     // m/s
};

type PaceStats = {
  current: string | null; // "5:30", null when stopped
  avg: string | null;
  best: string | null;
};

type Lap = {
  number: number;
  duration: number;   // seconds
  distance: number;   // km or mi
  avgSpeed: number;   // m/s
  avgPace: string | null;
};

type SessionSummary = {
  duration: number;  // seconds
  distance: number;  // km or mi
  steps: number;
  speed: SpeedStats;
  pace: PaceStats;
  calories: number;  // kcal (estimate)
  laps: Lap[];
};
```

---

## Native Events (advanced)

If you need raw sensor data, you can subscribe to the native events directly:

```ts
import RunningKit from 'expo-running-kit';

const sub = RunningKit.addListener('onLocationUpdate', ({ latitude, longitude, speed, accuracy }) => {
  // raw GPS event
});

const sub2 = RunningKit.addListener('onStepUpdate', ({ steps, cadence }) => {
  // raw pedometer event
});

// cleanup
sub.remove();
sub2.remove();
```

Available events: `onLocationUpdate`, `onStepUpdate`, `onSessionStateChange`.

---

## Auto-Pause Behaviour

When `autoPause: true`:

- The native layer monitors cadence continuously — even while GPS is paused.
- After ~3–4 seconds of zero cadence, the JS layer starts a short countdown (`autoPauseDelay`) then calls `autoPauseWorkout()` on the native side.
- GPS stops during auto-pause to save battery; the step sensor keeps running to detect movement.
- When cadence rises above `resumeThreshold` (default 30 spm), the workout resumes automatically and GPS restarts.
- Manual `pauseWorkout()` stops both GPS and the pedometer; `resumeWorkout()` restarts both.

---

## Platform Notes

| Feature | iOS | Android |
|---|---|---|
| GPS provider | CoreLocation | Fused Location Provider |
| Step counting | CMPedometer | TYPE_STEP_COUNTER sensor |
| Fast resume detection | CMPedometerEvent | Step sensor delta |
| Background location | Not included | Not included |

Background location is intentionally out of scope — add `expo-location` background task if needed.

---

## License

MIT
