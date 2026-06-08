import { PathCommand } from "./path";
import type { PathState } from "./path";

export class PathBuilder {
    private cmds: PathCommand[] = [];

    moveTo(x: number, y: number): this {
        this.cmds.push({ type: "M", x, y });
        return this;
    }

    lineTo(x: number, y: number): this {
        this.cmds.push({ type: "L", x, y });
        return this;
    }

    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
        this.cmds.push({ type: "C", x1, y1, x2, y2, x, y });
        return this;
    }

    quadraticCurveTo(x1: number, y1: number, x: number, y: number): this {
        this.cmds.push({ type: "Q", x1, y1, x, y });
        return this;
    }

    arc(rx: number, ry: number, rotation: number, largeArc: 0 | 1, sweep: 0 | 1, x: number, y: number): this {
        this.cmds.push({ type: "A", rx, ry, rotation, largeArc, sweep, x, y });
        return this;
    }

    close(): this {
        this.cmds.push({ type: "Z" });
        return this;
    }

    toCommands(): PathCommand[] {
        return [...this.cmds];
    }

    toPathState(partial: Omit<Partial<PathState>, "d"> = {}): Partial<PathState> {
        return { ...partial, d: this.cmds };
    }
}
