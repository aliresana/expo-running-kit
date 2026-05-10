import * as React from 'react';

import { RunningKitViewProps } from './RunningKit.types';

export default function RunningKitView(props: RunningKitViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
