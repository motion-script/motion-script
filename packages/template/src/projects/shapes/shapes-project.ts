import { createProject } from '@motion-script/core';

import {
    ColorFillScene,
    LinearGradientScene,
    ConicGradientScene,
    RadialGradientScene,
    ColorGradientMorphScene,
    ImageFillScene,
    ShadowScene,
    DashStrokeScene,
    AlignmentStrokeScene,
    UnionShadowScene,
    MaskScene,
    BooleanOperatorScene,
    RichTextScene,
    AutofitTextScene,
    LetterSpacingScene,
    VariableFontScene,
    WrappingTextScene,
    TextStrokeScene,
    TextFillsScene,
    TextShadowScene,
} from './scenes';

/**
 * A project that walks through every fill, stroke, and shadow case, one
 * scene per case. Each scene shows a fill-painted shape and a stroke-painted
 * shape side by side animating the same fill chain.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, point the `@motion-script/vite-plugin` `entry` option at this
 * file, or temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Shapes Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        new ColorFillScene(),
        new LinearGradientScene(),
        new ConicGradientScene(),
        new RadialGradientScene(),
        new ColorGradientMorphScene(),
        new ImageFillScene(),
        new ShadowScene(),
        new DashStrokeScene(),
        new AlignmentStrokeScene(),
        new UnionShadowScene(),
        new MaskScene(),
        new BooleanOperatorScene(),
        new RichTextScene(),
        new AutofitTextScene(),
        new LetterSpacingScene(),
        new VariableFontScene(),
        new WrappingTextScene(),
        new TextStrokeScene(),
        new TextFillsScene(),
        new TextShadowScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD'
    },
});
