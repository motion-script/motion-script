import { describe, it, expect, afterEach } from "vitest";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import { setVariables } from "@/project/variables";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10;

describe("CanvasStage.variables — project variables", () => {
    afterEach(() => setVariables());

    it("returns the value registered for a flat key", () => {
        setVariables({ "rounded-lg": 32 });
        const stage = new CanvasStage(VIEWPORT, FPS);
        expect(stage.variables("rounded-lg")).toBe(32);
    });

    it("looks up case-insensitively", () => {
        setVariables({ "rounded-lg": 32 });
        const stage = new CanvasStage(VIEWPORT, FPS);
        expect(stage.variables("Rounded-LG")).toBe(32);
    });

    it("returns values of any asserted type via the generic", () => {
        setVariables({ palette: [1, 2, 3] });
        const stage = new CanvasStage(VIEWPORT, FPS);
        expect(stage.variables<number[]>("palette")).toEqual([1, 2, 3]);
    });

    it("returns the fallback when the variable is absent", () => {
        setVariables({ "rounded-lg": 32 });
        const stage = new CanvasStage(VIEWPORT, FPS);
        expect(stage.variables("rounded-xl", 64)).toBe(64);
    });

    it("returns undefined when absent and no fallback is given", () => {
        setVariables({ "rounded-lg": 32 });
        const stage = new CanvasStage(VIEWPORT, FPS);
        expect(stage.variables("rounded-xl")).toBeUndefined();
    });
});
