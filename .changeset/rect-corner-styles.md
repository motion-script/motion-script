---
"@motion-script/core": major
---

Rename `borderRadius` → `cornerRadius` and add corner styles.

**Breaking:** the `borderRadius` prop has been renamed to `cornerRadius` on every shape that had it (`Rect`, `Polygon`, `Polygram`, `Grid`, `Image`, `Video`). Replace `borderRadius={…}` with `cornerRadius={…}`.

**New — `cornerStyle`:** `'rounded'` (a circular arc) or `'angled'` (a straight diagonal chamfer cut across the corner).

On `Rect` (and `Grid`/`Image`/`Video`, which inherit it), `cornerRadius` and `cornerStyle` both accept the same shorthand: a single value, `{ topLeft, topRight, bottomLeft, bottomRight }`, `{ top, bottom }`, or `{ left, right }`. `Polygon` and `Polygram` take a single scalar `cornerStyle` applied to every vertex.

```tsx
// Chamfered corners
<Rect width={200} height={200} cornerRadius={24} cornerStyle="angled" />

// Mixed: rounded top, angled bottom
<Rect cornerRadius={28} cornerStyle={{ top: 'rounded', bottom: 'angled' }} />
```

Both properties tween: radius interpolates per corner; style snaps at the midpoint.
