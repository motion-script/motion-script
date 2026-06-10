// Ambient declaration of the headless bridge the @motion-script/vite-plugin
// installs on `window` in `?headless` mode. Mirrors the `HeadlessBridge` shape
// in vite-plugin/plugin-app/src/headless.ts. Declared locally (rather than
// imported) because the bridge module only exists in the browser bundle, not
// as a published type — these globals are referenced inside Playwright
// `page.evaluate` callbacks, which TypeScript checks in this Node project.

interface MotionScriptHeadlessBridge {
    readonly projectName: string;
    listScenes(): string[];
    export(options: {
        sceneNames?: string[];
        split?: boolean;
        scale?: number;
    }): Promise<void>;
}

interface Window {
    __motionScript?: MotionScriptHeadlessBridge;
    __motionScriptProgress?: (file: string, progress: number) => void;
    __motionScriptFileReady?: (scene: string | null, base64: string) => Promise<void>;
}

// Minimal browser globals used only inside Playwright `page.evaluate` callbacks
// (which execute in the browser). Declared here instead of pulling in the full
// DOM lib so browser globals don't leak into the rest of this Node CLI.
declare const window: Window;
