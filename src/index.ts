// Reexport the native module. On web, it will be resolved to RunningKitModule.web.ts
// and on native platforms to RunningKitModule.ts
export { default } from './RunningKitModule';
export { default as RunningKitView } from './RunningKitView';
export * from  './RunningKit.types';
