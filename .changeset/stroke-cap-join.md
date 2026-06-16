---
"@motion-script/core": minor
"@motion-script/web": minor
---

Add `cap`, `join`, and `miterLimit` to the stroke prop.

Strokes now control how their ends and corners are shaped:

- **`cap`** — `'butt'` (default), `'round'`, or `'square'`. Shapes the ends of open strokes and the ends of each dash.
- **`join`** — `'miter'` (default), `'round'`, or `'bevel'`. Shapes corners where two segments meet.
- **`miterLimit`** — number (default `4`). Caps how far a `'miter'` join may spike past the path before it falls back to a bevel.

```tsx
<Line points={[...]} stroke={{ weight: 16, fill: 'white', cap: 'round' }} />
<Rect stroke={{ weight: 16, fill: 'royalblue', join: 'bevel' }} />
```

All three are honored across centered, aligned, dashed, and shadowed strokes. `miterLimit` interpolates when tweened; `cap` and `join` snap at the midpoint.
