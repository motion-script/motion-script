// Public API for @motion-script/react.
//
// Keep this surface intentional: only re-export what consumers should use.
// No CSS or other side-effecting imports belong here — the package is marked
// "sideEffects": false so bundlers can drop anything a consumer doesn't import.
export { MotionScriptProvider, useMotionScript } from './ui/provider';
export { MotionPlayer } from './ui/scene';
export type { FrameHandle } from './ui/scene';
export type { BuildError } from '@motion-script/core';
