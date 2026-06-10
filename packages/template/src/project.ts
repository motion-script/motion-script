import { createProject } from '@motion-script/core';
import { NumberScene } from "./scenes/number-scene";
import { ShapeScene } from "./scenes/shape";

import { BloomScene } from "./scenes/effects/bloom";
import { ChromaticAberrationScene } from "./scenes/effects/chromatic-aberration";

import { LayoutScene } from './scenes/layout-scene';

import { CodeScene } from './scenes/code-scene';

import { LogoScene } from './scenes/logo-scene';
import { DrawScene } from './scenes/draw-scene';
import { ImageGrid, ImageGridScene } from './scenes/image-grid-scene';
import { EffectScene } from './scenes/effect-scene';
import { FillScene } from './scenes/fill-scene';

export default createProject({
  name: 'My Video',
  fps: 60,
  viewport: {
    width: 1920,
    height: 1080
  },
  scenes: [
    new FillScene(),
    new EffectScene(),
    new ImageGridScene(),
    //new DrawScene(),
    new LogoScene(),
    // new LayoutScene(),
    // new NumberScene(),
    // new BloomScene(),
    // new ChromaticAberrationScene(),
    // new ShapeScene(),
    // new CodeScene(),
  ],
  theme: {
    'bg': '#0D0F15',
    'card': '#161a21'
  }
})