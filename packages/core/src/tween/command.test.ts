import { describe, expect, it } from "vitest";

import { Rect } from "@/nodes/geometry/rect-node";
import { commandParallel, commandSequence, isCommand, makeCommand, type Command } from "./command";
import { command, getCommandMeta } from "./command-decorator";
import { lerpNumber } from "./lerp";
import type { EasingFunction } from "./ease/type";

const FPS = 30;
const DT = 1 / FPS;

/** Drive `cmd` as a generator and record `read` after every frame. */
function run<T>(cmd: Command<never>, read: () => T): T[] {
    const frames: T[] = [];
    const it = cmd[Symbol.iterator]();
    it.next();
    frames.push(read());
    for (let guard = 0; guard < 1000; guard++) {
        if (it.next(DT).done) break;
        frames.push(read());
    }
    return frames;
}

class Widget extends Rect {
    @command()
    slide(to: number, duration = 1, easing?: EasingFunction): Command<{ x: number }> {
        const from = this.x;
        return this.animate((t) => ({ x: lerpNumber(from, to, t) }), duration, easing);
    }

    @command({ name: "Fade out" })
    vanish(duration = 1): Command<{ opacity: number }> {
        const from = this.opacity;
        return this.animate((t) => ({ opacity: lerpNumber(from, 0, t) }), duration);
    }
}

describe("Command", () => {
    it("evaluates at a time without having run to it", () => {
        const node = new Widget({ width: 10, height: 10, x: 0 });
        const cmd = node.slide(100, 2);

        // The whole point: frame N is available without frames 0..N-1.
        expect(cmd.at(0)).toEqual({ x: 0 });
        expect(cmd.at(0.5)).toEqual({ x: 50 });
        expect(cmd.at(1)).toEqual({ x: 100 });
        // And out of order, which a generator cannot do at all.
        expect(cmd.at(0.25)).toEqual({ x: 25 });
    });

    it("agrees frame-for-frame with running it", () => {
        // The invariant the whole design rests on. `_stepper` and the iterator are
        // *derived* from `at`, so a host that seeks and a scene that runs cannot
        // drift — but only if the derivation is right, which is what this pins.
        const running = new Widget({ width: 10, height: 10, x: 0 });
        const frames = run(running.slide(90, 1) as Command<never>, () => running.x);

        const seeking = new Widget({ width: 10, height: 10, x: 0 });
        const cmd = seeking.slide(90, 1);
        const stepper = cmd._stepper();

        frames.forEach((expected, frame) => {
            stepper.seek(frame * DT);
            expect(seeking.x).toBeCloseTo(expected, 6);
        });
    });

    it("clamps outside [0,1] rather than extrapolating", () => {
        const node = new Widget({ width: 10, height: 10, x: 0 });
        const cmd = node.slide(100, 1);

        expect(cmd.at(-1)).toEqual({ x: 0 });
        expect(cmd.at(5)).toEqual({ x: 100 });
    });

    it("applies easing inside, so callers pass raw normalized time", () => {
        const node = new Widget({ width: 10, height: 10, x: 0 });
        const eased = node.slide(100, 1, (t) => t * t);

        expect(eased.at(0.5)).toEqual({ x: 25 });
    });

    it("stamps a zero-duration command on its first frame", () => {
        // `at` is in *normalized* time, so `at(0)` is the start whatever the
        // duration — the collapse belongs to the driver, which has no time left
        // to spend and so lands on the end immediately.
        const node = new Widget({ width: 10, height: 10, x: 0 });
        const cmd = node.slide(42, 0);

        expect(cmd.at(0)).toEqual({ x: 0 });
        expect(cmd.at(1)).toEqual({ x: 42 });

        const stepper = cmd._stepper();
        stepper.seek(0);
        expect(node.x).toBe(42);
        expect(stepper.advance(DT)).toBe(true);
    });

    it("is recognisable, so a host can tell it from a bare generator", () => {
        const node = new Widget({ width: 10, height: 10 });

        expect(isCommand(node.slide(1))).toBe(true);
        // `to()` is itself a Command now — no more AnimationBuilder in between.
        expect(isCommand(node.to({ x: 1 }, 1))).toBe(true);
    });
});

describe("command composition", () => {
    const target = { set: () => { } };

    const step = (from: number, to: number, duration: number): Command<{ v: number }> =>
        makeCommand<{ v: number }>(target, (t) => ({ v: lerpNumber(from, to, t) }), duration);

    it("sequences, holding a finished child at its end value", () => {
        const seq = commandSequence(target, step(0, 10, 1), step(10, 20, 1));

        expect(seq.duration).toBe(2);
        expect(seq.at(0)).toEqual({ v: 0 });
        expect(seq.at(0.25)).toEqual({ v: 5 });
        // Exactly at the handover: the first child is done, the second at zero.
        expect(seq.at(0.5)).toEqual({ v: 10 });
        expect(seq.at(0.75)).toEqual({ v: 15 });
        expect(seq.at(1)).toEqual({ v: 20 });
    });

    it("omits a sequenced child that has not started", () => {
        // A prop a later step writes should not exist yet — that is what lets a
        // host tell "not yet written" from "written back to its start value".
        const seq = commandSequence<{ v?: number; w?: number }>(
            target,
            makeCommand(target, () => ({ v: 1 }), 1),
            makeCommand(target, () => ({ w: 2 }), 1),
        );

        expect(seq.at(0.25)).toEqual({ v: 1 });
        expect(seq.at(0.75)).toEqual({ v: 1, w: 2 });
    });

    it("runs in parallel, ending with the longest", () => {
        const par = commandParallel<{ a?: number; b?: number }>(
            target,
            makeCommand(target, (t) => ({ a: t }), 1),
            makeCommand(target, (t) => ({ b: t }), 2),
        );

        expect(par.duration).toBe(2);
        // Halfway through the group: the short child has finished and holds, the
        // long one is at its own midpoint.
        expect(par.at(0.5)).toEqual({ a: 1, b: 0.5 });
    });
});

describe("@command metadata", () => {
    it("lists a class's commands, inherited first", () => {
        const meta = getCommandMeta(new Widget({ width: 1, height: 1 }));

        // `ShapeNode`'s paint commands come first, then this class's own — the
        // order a host would show them in, general before specific.
        expect(meta.map(m => m.key)).toEqual([
            "fillTo", "overlayTo", "strokeTo", "shadowTo",
            "slide", "vanish",
        ]);
    });

    it("carries a display name only where one was given", () => {
        // Built-ins leave it unset — their names live in the host's i18n
        // catalogue, keyed by the command key. A package has nowhere else.
        const meta = getCommandMeta(new Widget({ width: 1, height: 1 }));

        expect(meta.find(m => m.key === "slide")?.name).toBeUndefined();
        expect(meta.find(m => m.key === "vanish")?.name).toBe("Fade out");
    });
});
