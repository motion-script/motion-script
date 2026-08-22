// Entry point of the CLI's headless harness app.
//
// The harness exists only to give the render pipeline a real browser document
// to run in: `@motion-script/cli` boots this page in headless Chromium (see
// src/driver.ts) and then drives the bridge installed on `window.__motionScript`
// to list, screenshot and export scenes.
//
// There is no UI and no conditional mode — a bare static import, so the bridge
// and everything it pulls in (CanvasKit, the exporter, the user's scenes) are
// part of the entry's static graph. That is what lets the driver warm Vite's
// dep-optimizer to completion *before* the page loads: a dynamic import here
// would hide those deps from the scan, get discovered mid-load, and trigger a
// re-optimize + reload that the headless server (hmr: false) never delivers.
import { installHeadlessBridge } from './headless.js';

installHeadlessBridge();
