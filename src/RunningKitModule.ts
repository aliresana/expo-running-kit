import { NativeModule, requireNativeModule } from "expo";

import {
  RunningKitEvents,
  WorkoutType,
  PermissionsResult,
  SessionSummary,
} from "./RunningKit.types";

declare class RunningKitModule extends NativeModule<RunningKitEvents> {
  requestPermissions(): Promise<PermissionsResult>;
  startWorkout(type: WorkoutType): Promise<void>;
  autoPauseWorkout(): void;
  pauseWorkout(): void;
  resumeWorkout(): void;
  stopWorkout(): Promise<SessionSummary>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<RunningKitModule>("RunningKit");
