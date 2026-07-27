import { createProject } from 'motion-script';

import blur from './scenes/blur?scene';
import directionalBlur from './scenes/directional-blur?scene';
import backgroundBlur from './scenes/background-blur?scene';
import grayscale from './scenes/grayscale?scene';
import pixelate from './scenes/pixelate?scene';
import bulge from './scenes/bulge?scene';
import magnify from './scenes/magnify?scene';
import bloom from './scenes/bloom?scene';
import vintage from './scenes/vintage?scene';
import chromaticAberration from './scenes/chromatic-aberration?scene';
import scatter from './scenes/scatter?scene';
import posterize from './scenes/posterize?scene';
import frosted from './scenes/frosted?scene';
import retroVhs from './scenes/retro-vhs?scene';
import invert from './scenes/invert?scene';
import motionBlur from './scenes/motion-blur?scene';
import outline from './scenes/outline?scene';
import vignette from './scenes/vignette?scene';
import grain from './scenes/grain?scene';
import sharpen from './scenes/sharpen?scene';
import edges from './scenes/edges?scene';
import threshold from './scenes/threshold?scene';
import radialBlur from './scenes/radial-blur?scene';
import halftone from './scenes/halftone?scene';
import dither from './scenes/dither?scene';
import duotone from './scenes/duotone?scene';
import curves from './scenes/curves?scene';
import colorAdjustment from './scenes/color-adjustment?scene';
import rgbShift from './scenes/rgb-shift?scene';
import scanlines from './scenes/scanlines?scene';
import blockDisplace from './scenes/block-displace?scene';
import bitCrush from './scenes/bit-crush?scene';
import presetRiso from './scenes/preset-riso?scene';
import presetNewsprint from './scenes/preset-newsprint?scene';
import presetBlueprint from './scenes/preset-blueprint?scene';
import presetPhotocopy from './scenes/preset-photocopy?scene';
import presetVhs from './scenes/preset-vhs?scene';
import presetCrt from './scenes/preset-crt?scene';
import presetGlitch from './scenes/preset-glitch?scene';
import presetGameboy from './scenes/preset-gameboy?scene';
import ascii from './scenes/ascii?scene';
import streak from './scenes/streak?scene';
import godRays from './scenes/god-rays?scene';
import oilPaint from './scenes/oil-paint?scene';
import texture from './scenes/texture?scene';
import presetScreenPrint from './scenes/preset-screen-print?scene';
import presetThermalPrint from './scenes/preset-thermal-print?scene';
import presetPencilSketch from './scenes/preset-pencil-sketch?scene';
import presetChalk from './scenes/preset-chalk?scene';
import presetNeon from './scenes/preset-neon?scene';
import presetComic from './scenes/preset-comic?scene';
import presetAnamorphic from './scenes/preset-anamorphic-glare?scene';
import presetOilPainting from './scenes/preset-oil-painting?scene';
import presetPaper from './scenes/preset-paper?scene';

/**
 * A project that walks through every built-in effect, one scene per effect.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To preview
 * it, point the `@motion-script/vite-plugin` `entry` option at this file, or
 * temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Effects Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080 - 240,
    },
    scenes: [
        blur,
        directionalBlur,
        backgroundBlur,
        grayscale,
        pixelate,
        bulge,
        magnify,
        bloom,
        vintage,
        chromaticAberration,
        scatter,
        posterize,
        frosted,
        retroVhs,
        invert,
        motionBlur,
        outline,
        vignette,
        grain,
        sharpen,
        edges,
        threshold,
        radialBlur,
        halftone,
        dither,
        duotone,
        curves,
        colorAdjustment,
        rgbShift,
        scanlines,
        blockDisplace,
        bitCrush,
        presetRiso,
        presetNewsprint,
        presetBlueprint,
        presetPhotocopy,
        presetVhs,
        presetCrt,
        presetGlitch,
        presetGameboy,
        ascii,
        streak,
        godRays,
        oilPaint,
        texture,
        presetScreenPrint,
        presetThermalPrint,
        presetPencilSketch,
        presetChalk,
        presetNeon,
        presetComic,
        presetAnamorphic,
        presetOilPainting,
        presetPaper,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#1e232b',
            'primary': '#6990DD'
        },
    },
});
