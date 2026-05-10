import { registerWebModule, NativeModule } from 'expo';

import { RunningKitModuleEvents } from './RunningKit.types';

class RunningKitModule extends NativeModule<RunningKitModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(RunningKitModule, 'RunningKitModule');
