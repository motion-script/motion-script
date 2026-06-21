import { AFX, fadeIn, fadeOut } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { audioDemo } from "./audio-demo";

/**
 * Time-varying gain: a volume curve that fades in over the first 0.5s and fades
 * out over the last 1s. The fade-out is anchored to the clip's end by `fadeOut`,
 * so it works on any clip length without naming an absolute time.
 */
export default createScene(audioDemo({
    label: 'Fade in / out',
    clip: 8,
    // Longer fades are easier to hear on the 8s demo clip: in over 1.5s, out over 2s.
    filters: AFX.volume(fadeIn(1.5).fadeOut(2)),
}));
