import { Size2D } from "@/attributes/layout/size";
import { Color } from "@/attributes/shape/fill/color/parser";
import { Scene } from "@/nodes/base/scene-node";

/** Top-level project definition passed to the runtime and player. */
export interface ProjectConfig {
    /** Human-readable project name shown in the player UI. */
    name: string;
    /** Ordered list of scenes that make up the project. */
    scenes: Scene[];
    /** Output canvas dimensions in pixels. Defaults to 1920×1080. */
    viewport: Size2D;
    /** Target frame rate. Defaults to 60 fps. */
    fps: number;
    /** Named color tokens available to all scenes via the theme system. */
    theme?: Record<string, Color>;
}

/**
 * Creates a `ProjectConfig` with sensible defaults.
 * Only `name` is required; all other fields fall back to standard values.
 */
export function createProject(props: Partial<ProjectConfig> & { name: string }): ProjectConfig {
    return {
        name: props.name,
        fps: props.fps ?? 60,
        viewport: props.viewport ?? { width: 1920, height: 1080 },
        scenes: props.scenes ?? [],
        theme: props.theme,
    }
}
