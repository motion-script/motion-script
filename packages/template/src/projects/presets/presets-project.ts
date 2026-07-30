import { createProject } from 'motion-script';

// Print
import presetRiso from './scenes/preset-riso?scene';
import presetNewsprint from './scenes/preset-newsprint?scene';
import presetPhotocopy from './scenes/preset-photocopy?scene';
import presetThermalPrint from './scenes/preset-thermal-print?scene';
import presetScreenPrint from './scenes/preset-screen-print?scene';
import presetComic from './scenes/preset-comic?scene';
import presetPaper from './scenes/preset-paper?scene';

// Screen
import presetVhs from './scenes/preset-vhs?scene';
import presetCrt from './scenes/preset-crt?scene';
import presetGlitch from './scenes/preset-glitch?scene';
import presetGameboy from './scenes/preset-gameboy?scene';

// Drawn
import presetBlueprint from './scenes/preset-blueprint?scene';
import presetPencilSketch from './scenes/preset-pencil-sketch?scene';
import presetChalk from './scenes/preset-chalk?scene';
import presetOilPainting from './scenes/preset-oil-painting?scene';

// Light
import presetNeon from './scenes/preset-neon?scene';
import presetAnamorphic from './scenes/preset-anamorphic-glare?scene';

/**
 * Named looks, one scene per recipe.
 *
 * Separate from the effects showcase on purpose: that project demonstrates what
 * each *built-in effect* does on its own, while this one demonstrates what you
 * get by *composing* several of them. Nothing here is engine API — every recipe
 * is defined locally in `scenes/recipes.ts`, which is the whole point: a look is
 * a matter of taste, so it belongs in your project where you can retune it,
 * rather than in the library where its numbers would become a compatibility
 * promise.
 *
 * Both projects share the sample grid in `src/shared/effect-demo.tsx`, so a
 * recipe is shown across the same four content types (photo, text, stroke, flat
 * fill) as a single effect is.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To preview
 * it, re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Recipes Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080 - 240,
    },
    scenes: [
        // Print
        presetRiso,
        presetNewsprint,
        presetPhotocopy,
        presetThermalPrint,
        presetScreenPrint,
        presetComic,
        presetPaper,
        // Screen
        presetVhs,
        presetCrt,
        presetGlitch,
        presetGameboy,
        // Drawn
        presetBlueprint,
        presetPencilSketch,
        presetChalk,
        presetOilPainting,
        // Light
        presetNeon,
        presetAnamorphic,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#1e232b',
            'primary': '#6990DD'
        },
    },
});
