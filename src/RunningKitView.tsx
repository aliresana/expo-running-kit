import { requireNativeView } from 'expo';
import * as React from 'react';

import { RunningKitViewProps } from './RunningKit.types';

const NativeView: React.ComponentType<RunningKitViewProps> =
  requireNativeView('RunningKit');

export default function RunningKitView(props: RunningKitViewProps) {
  return <NativeView {...props} />;
}
