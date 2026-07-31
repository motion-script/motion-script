// @motion-script/web/audio — stacked-audio playback and mixdown, with no
// renderer attached.
//
// A separate entry point from the package barrel on purpose: that barrel loads
// the CanvasKit/Skia backend at module scope, and nothing here draws anything.
// A host building an audio timeline should not pay for the WASM module.

export { AudioTimeline, createAudioTimeline } from "./timeline";
export type { AudioTimelineOptions, MixdownOptions } from "./timeline";

export { mixAudio, encodeWav, WebAudioMixer, DEFAULT_SAMPLE_RATE } from "./mixer";
export type { MixAudioOptions } from "./mixer";

export { WebAudioDevice, WebAudioDevice as WebAudioPlayer } from "./player";
