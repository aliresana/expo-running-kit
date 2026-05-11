# Changelog

All notable changes to this project will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-05-11

### Added
- `useRunningKit` hook — single entry point for all workout data and controls
- GPS tracking via CoreLocation (iOS) and Fused Location Provider (Android)
- Real-time speed with configurable rolling-average smoothing
- Pace (current, average, best) in min/km or min/mi
- Step counting and cadence (spm) via CMPedometer (iOS) and TYPE_STEP_COUNTER (Android)
- Auto-pause / auto-resume based on cadence (motion sensor, not GPS speed)
- Lap recording with per-lap distance, duration, and pace
- GPS quality indicator: excellent / good / fair / poor
- Metric and imperial unit support for distance and pace
- `requestPermissions()` for location and motion access
- Native events: `onLocationUpdate`, `onStepUpdate`, `onSessionStateChange`
- `SessionSummary` returned on `stopWorkout()` with duration, distance, steps, speed, pace, calories, and laps
- Separate `auto-paused` session state distinct from manual `paused`
- iOS: CMPedometerEvent-based fast auto-resume detection
- Android: cadence window reset for accurate cadence after pause
- GPS quality auto-degrades to "poor" after 4 s with no location updates
