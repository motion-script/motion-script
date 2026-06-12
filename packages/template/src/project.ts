import { createProject } from '@motion-script/core';
import { NumberScene } from "./scenes/number-scene";
import { ShapeScene } from "./scenes/shape";

import { LayoutScene } from './scenes/layout-scene';

import { CodeScene } from './scenes/code-scene';

import { LogoScene } from './scenes/logo-scene';
import { DrawScene } from './scenes/draw-scene';
import { ImageGrid, ImageGridScene } from './scenes/image-grid-scene';
import { FillScene } from './scenes/fill-scene';
import effectsProject from './projects/effects/effects-project';
import shapesProject from './projects/shapes/shapes-project';
import blendsProject from './projects/blends/blends-project';
import drawProject from './projects/draw/draw-project';
import layoutProject from './projects/layout/layout-project';

export default drawProject;
// createProject({
//   name: 'My Video',
//   fps: 60,
//   viewport: {
//     width: 1920,
//     height: 1080
//   },
//   scenes: [
//     new FillScene(),
//     new ImageGridScene(),
//     //new DrawScene(),
//     new LogoScene(),
//     // new LayoutScene(),
//     // new NumberScene(),
//     // new ShapeScene(),
//     // new CodeScene(),
//     // For a per-effect walkthrough of every built-in effect, see the standalone
//     // `./effects-project.ts` (one scene per effect).
//   ],
//   theme: {
//     'bg': '#0D0F15',
//     'card': '#161a21'
//   }
// })
