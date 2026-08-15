import { describe, expect, it } from "vitest";

import { withTextDescriptor } from "./text";

/**
 * `fontFamily` is required, and this is where that is enforced.
 *
 * It used to fall back to `"Arial"`, which is the wrong shape of answer for a
 * renderer whose job is that the picture is the one that was asked for. A drawn
 * op reaching here with no family means nobody stated one — not the op, not an
 * enclosing `DefaultTextStyle`, not the theme's `default` preset — and a
 * substituted face produces text in a typeface nobody chose, at metrics nobody
 * measured, in a frame that looks finished. What it hides is a font that was
 * never declared and so never loaded.
 */
describe("withTextDescriptor", () => {
    it("keeps the family it was given", () => {
        expect(withTextDescriptor({ text: "hi", fontFamily: "Inter" }).fontFamily)
            .toBe("Inter");
    });

    it("throws when no layer supplied one", () => {
        expect(() => withTextDescriptor({ text: "hi" })).toThrow(/fontFamily/);
    });

    it("treats an empty family as absent", () => {
        // `""` reaches a font manager as a request for nothing and comes back as
        // whatever the platform felt like, which is the silent substitution this
        // exists to stop — so it is the same fault as omitting it.
        expect(() => withTextDescriptor({ text: "hi", fontFamily: "" }))
            .toThrow(/fontFamily/);
    });

    it("names the three places a family can come from", () => {
        // The message is the whole value of the error: "no font family" is not
        // actionable, and this is.
        expect(() => withTextDescriptor({ text: "hi" }))
            .toThrow(/DefaultTextStyle[\s\S]*typography/);
    });

    it("quotes the text so the failing node can be found", () => {
        expect(() => withTextDescriptor({ text: "Chapter One" }))
            .toThrow(/Chapter One/);
    });
});
