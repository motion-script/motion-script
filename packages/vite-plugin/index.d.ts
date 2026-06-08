import type { PluginOption } from 'vite';

export interface MotionScriptOptions {
    /** * Optional: Explicitly define the entry file for the animation script.
     * If omitted, the plugin will auto-discover src/index.ts or src/main.ts.
     */
    entry?: string;
}

/**
 * Motion Script Vite Plugin
 * * Hijacks the Vite environment to run the internal Motion Studio host app,
 * seamlessly injecting the user's animation logic.
 */
export default function motionScript(options?: MotionScriptOptions): PluginOption[];