import { describe, expect, it } from "vitest";

import { assertValidDocument, validateDocument } from "../validate";
import type { AnimationDocument, StillDocument } from "../types";

/** Every issue's path, so a test asserts *where* the problem was found. */
const paths = (doc: unknown): string[] => validateDocument(doc).issues.map((i) => i.path);

describe("validateDocument", () => {
    it("accepts a well-formed still", () => {
        const doc: StillDocument = {
            kind: "still",
            nodes: [
                { id: "a", type: "rect", parent: null, order: 0, props: {} },
                { id: "b", type: "text", parent: "a", order: 0, props: { text: "hi" } },
            ],
        };
        expect(validateDocument(doc)).toEqual({ valid: true, issues: [] });
    });

    it("accepts a well-formed animation", () => {
        const doc: AnimationDocument = {
            kind: "animation",
            commands: [
                {
                    id: "c0", type: "add", target: null, at: 0, params: {
                        node: { id: "a", type: "rect", parent: null, order: 0, props: {} },
                    },
                },
                { id: "c1", type: "to", target: "a", at: 0, duration: 1, params: { props: { x: 10 } } },
            ],
        };
        expect(validateDocument(doc).valid).toBe(true);
    });

    it("rejects an unknown kind", () => {
        expect(paths({ kind: "video" })).toEqual(["kind"]);
    });

    it("reports every issue rather than stopping at the first", () => {
        const issues = validateDocument({
            kind: "still",
            nodes: [
                { id: "", type: "rect", parent: null, order: 0, props: {} },
                { id: "b", type: "", parent: null, order: "x", props: null },
            ],
        }).issues;
        expect(issues.length).toBeGreaterThan(3);
    });

    it("catches a parent that names no node", () => {
        expect(paths({
            kind: "still",
            nodes: [{ id: "a", type: "rect", parent: "ghost", order: 0, props: {} }],
        })).toContain("nodes[0].parent");
    });

    it("catches duplicate node ids", () => {
        expect(paths({
            kind: "still",
            nodes: [
                { id: "a", type: "rect", parent: null, order: 0, props: {} },
                { id: "a", type: "rect", parent: null, order: 1, props: {} },
            ],
        })).toContain("nodes[1].id");
    });

    /**
     * A parent cycle would otherwise recurse until the stack overflows, with a
     * trace pointing at the layout engine rather than at the two rows involved.
     */
    it("catches a parent cycle", () => {
        const result = validateDocument({
            kind: "still",
            nodes: [
                { id: "a", type: "rect", parent: "b", order: 0, props: {} },
                { id: "b", type: "rect", parent: "a", order: 0, props: {} },
            ],
        });
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => /cycle/.test(i.message))).toBe(true);
    });

    it("catches a command whose target is never added", () => {
        expect(paths({
            kind: "animation",
            commands: [{ id: "c", type: "to", target: "ghost", at: 0, duration: 1, params: {} }],
        })).toContain("commands[0].target");
    });

    /** The rule a timeline editor breaks by dragging a tween before its node exists. */
    it("catches a command that runs before its target is added", () => {
        expect(paths({
            kind: "animation",
            commands: [
                {
                    id: "c0", type: "add", target: null, at: 2, params: {
                        node: { id: "a", type: "rect", parent: null, order: 0, props: {} },
                    },
                },
                { id: "c1", type: "to", target: "a", at: 1, duration: 1, params: {} },
            ],
        })).toContain("commands[1].at");
    });

    it("catches a node added twice", () => {
        const spec = { id: "a", type: "rect", parent: null, order: 0, props: {} };
        expect(paths({
            kind: "animation",
            commands: [
                { id: "c0", type: "add", target: null, at: 0, params: { node: spec } },
                { id: "c1", type: "add", target: null, at: 1, params: { node: spec } },
            ],
        })).toContain("commands[1].params.node.id");
    });

    it("rejects a negative or non-finite time", () => {
        expect(paths({
            kind: "animation",
            commands: [{ id: "c", type: "to", target: null, at: -1, params: {} }],
        })).toContain("commands[0].at");
        expect(paths({
            kind: "animation",
            commands: [{ id: "c", type: "to", target: null, at: Infinity, params: {} }],
        })).toContain("commands[0].at");
    });

    it("rejects an unknown easing kind", () => {
        expect(paths({
            kind: "animation",
            commands: [{
                id: "c", type: "to", target: null, at: 0,
                easing: { kind: "bouncy" }, params: {},
            }],
        })).toContain("commands[0].easing.kind");
    });
});

describe("assertValidDocument", () => {
    it("returns the document when it is valid", () => {
        const doc: StillDocument = { kind: "still", nodes: [] };
        expect(assertValidDocument(doc)).toBe(doc);
    });

    it("throws with every issue listed", () => {
        expect(() => assertValidDocument({ kind: "nope" }))
            .toThrow(/Invalid scene document/);
    });
});
