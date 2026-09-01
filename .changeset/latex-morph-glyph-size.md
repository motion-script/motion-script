---
"@motion-script/latex": patch
---

A glyph that a formula morph carries from one formula to the next now changes **size** continuously instead of snapping. The default morph matched tokens by character and then emitted the *target* outline from the morph's very first frame, interpolating only its centroid — so a glyph that is set at a different size on the two sides (the `2` of `b^2` becoming the `2` of `2a`, or any symbol dropping into or out of a `\frac`) jumped to its new size between the last static frame and the first animated one, then glided smoothly to its new place. On the quadratic-formula derivation that is a 41–45% size jump on the affected glyphs, and on one step every matched glyph jumped.

Matched glyphs are now interpolated point by point across their paths, which is the same interpolation generalised from a glyph's average point to all of them. It is exact at both ends and correct in between: the two sides of a match are the same MathJax outline under two uniform-scale-plus-translate transforms, and a blend of two such transforms is another one, so the intermediate is a properly formed glyph at an intermediate size. It also costs nothing extra — the path was already being rebuilt every frame to apply the slide.

Where the two paths are *not* structurally identical — a stretchy delimiter assembled from a different number of pieces at the two sizes — the morph falls back to scaling the target outline down to the source's size and growing it back, so the size still changes continuously rather than jumping.

No API change: `AnimatedToken`, `LatexMorphStrategy` and a custom `morph` strategy are all unaffected.
