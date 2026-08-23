import { createProject, Image, Rect, Text } from 'motion-script';

import intro from './scenes/intro?scene';
import demo from './scenes/demo?scene';
import outro from './scenes/outro?scene';

/**
 * The project-level content surface: `backgrounds`, `overlays` and
 * `audioTracks` — everything that spans scenes rather than living inside one.
 *
 * - **backgrounds** draw *under* every scene, so a scene's own `fill` must be
 *   absent or translucent for them to show (all three scenes here use `bg/70`).
 * - **overlays** draw *over* every scene, outside its camera — a watermark
 *   stays put no matter how the scene zooms or pans.
 * - Either can be narrowed to specific scenes with `include`/`exclude`; the
 *   watermark below is suppressed on the end card.
 * - **audioTracks** lay a bed straight on the project timeline: `startAt`
 *   places it, `trimStart`/`trimEnd` crop the source, and it runs until the
 *   crop or the project ends.
 *
 * Layers are declared as **factories** (`() => …`) rather than bare nodes: the
 * project module is evaluated before the runtime registers `theme`, so a node
 * built inline here would resolve `fill="primary"` against an empty registry.
 * The runtime calls a factory after registration.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To preview
 * it, point the `@motion-script/vite-plugin` `entry` option at this file, or
 * temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Globals Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [intro, demo, outro],

    // Under every scene: one image, shared by the whole project.
    backgrounds: [
        {
            node: () => <Image src={'background.jpg'} width={'fill'} height={'fill'} />
        },
    ],

    overlays: [
        // Branding on every scene but the end card.
        {
            node: () => (
                <Rect width={'fill'} height={'fill'} align={'bottomRight'} padding={64}>
                    <Image src={'logo-title.png'} width={280} height={48} opacity={0.85} />
                </Rect>
            ),
            exclude: 'outro',
        },
        // A caption pinned to the middle scene only.
        {
            node: () => (
                <Rect width={'fill'} height={'fill'} align={'topLeft'} padding={64}>
                    <Text fontFamily={'Pixelify Sans'} text={'include: "demo"'} fontSize={40} fill={'primary'} />
                </Rect>
            ),
            include: 'demo',
        },
    ],

    // A music bed across the whole timeline, cropped to 4s of the source.
    audioTracks: [
        { src: 'song.mp3', volume: 0.5, trimStart: 8, trimEnd: 12 },
    ],

    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD',
        },
    },
});
