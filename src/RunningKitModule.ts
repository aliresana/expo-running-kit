import { NativeModule, requireNativeModule } from 'expo';

import { RunningKitModuleEvents } from './RunningKit.types';

declare class RunningKitModule extends NativeModule<RunningKitModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<RunningKitModule>('RunningKit');
