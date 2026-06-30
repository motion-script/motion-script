import { createProject } from 'motion-script';

import colorFill from './scenes/color-fill?scene';
import linearGradient from './scenes/linear-gradient?scene';
import conicGradient from './scenes/conic-gradient?scene';
import radialGradient from './scenes/radial-gradient?scene';
import colorGradientMorph from './scenes/color-gradient-morph?scene';
import imageFill from './scenes/image-fill?scene';
import shadow from './scenes/shadow?scene';
import innerShadow from './scenes/inner-shadow?scene';
import spreadShadow from './scenes/spread-shadow?scene';
import dashStroke from './scenes/dash-stroke?scene';
import alignmentStroke from './scenes/alignment-stroke?scene';
import capJoinStroke from './scenes/cap-join-stroke?scene';
import unionShadow from './scenes/union-shadow?scene';
import mask from './scenes/mask?scene';
import booleanOperator from './scenes/boolean-operators?scene';
import lineGrid from './scenes/line-grid?scene';
import richText from './scenes/rich-text?scene';
import autofitText from './scenes/autofit-text?scene';
import letterSpacing from './scenes/letter-spacing?scene';
import variableFont from './scenes/variable-font?scene';
import wrappingText from './scenes/wrapping-text?scene';
import textStroke from './scenes/text-stroke?scene';
import textFills from './scenes/text-fills?scene';
import textShadow from './scenes/text-shadow?scene';
import polygon from './scenes/polygon-scene?scene';
import cornerStyles from './scenes/corner-styles-scene?scene';
import fillArrayLerp from './scenes/fill-lerp?scene';

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
    name: 'Fills Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        fillArrayLerp,
        alignmentStroke,
        capJoinStroke,
        cornerStyles,
        polygon,
        colorFill,
        linearGradient,
        conicGradient,
        radialGradient,
        colorGradientMorph,
        imageFill,
        shadow,
        innerShadow,
        spreadShadow,
        dashStroke,
        alignmentStroke,
        unionShadow,
        mask,
        booleanOperator,
        lineGrid,
        richText,
        autofitText,
        letterSpacing,
        variableFont,
        wrappingText,
        textStroke,
        textFills,
        textShadow,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD'
        },
    },
});
