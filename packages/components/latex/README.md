# @motion-script/latex

Animated LaTeX math for [Motion Script](https://motionscript.dev). The `Latex`
node renders a formula to glyph paths with [MathJax](https://www.mathjax.org)
and animates between formulas token by token, so equations morph into one another
instead of cutting.

```tsx
import { Scene, createRef } from '@motion-script/core';
import { Latex } from '@motion-script/latex';

export class MathScene extends Scene {
  *build() {
    const eq = createRef<Latex>();

    this.add(
      <Latex
        ref={eq}
        fontSize={64}
        fill="white"
        latex="a^2 + b^2 = c^2"
      />,
    );

    yield* eq().to({ latex: 'c = \\sqrt{a^2 + b^2}' }, 1.2);
  }
}
```

## What's in here

- **`Latex`** node, a `ShapeNode` that draws a formula as fillable, strokable
  glyph paths. Set `latex` to the TeX source and `fontSize` to scale it; `fill`,
  `stroke`, `shadow`, and `padding` work like any other shape.
- **Formula morphing**, `to({ latex, fontSize }, duration)` interpolates each
  glyph between the current and target formula, matching tokens that persist,
  fading out tokens that leave, and fading in tokens that arrive. The hugging box
  resizes smoothly across the transition.
- **`buildLatexPath(latex, fontSize)`**, the underlying helper that turns TeX
  into positioned `LatexToken` glyph paths plus intrinsic size and bounds, for
  callers that want the geometry directly.

TeX is parsed through MathJax with the `base`, `ams`, `boldsymbol`,
`newcommand`, `cancel`, `color`, `mhchem`, `physics`, `bbox`, and `mathtools`
packages enabled. Rendering is synchronous and browser-only.

This package builds on [`@motion-script/core`](../../core) (the scene graph and
animation runtime) and renders through whatever backend draws the scene, such as
[`@motion-script/web`](../../web).

## Usage

```bash
npm install @motion-script/latex
```

For a guided setup, scaffold a project instead with:

```bash
npm create motion-script@latest
```

See the [docs](https://motionscript.dev/docs) for the full feature set and API
reference.

## Development

From the monorepo root:

```bash
pnpm --filter @motion-script/latex build
pnpm --filter @motion-script/latex test
```
