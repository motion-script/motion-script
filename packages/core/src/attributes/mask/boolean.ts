// Figma-style boolean operations between child paths.
// `union`     — combine all child paths
// `subtract`  — first child minus the rest
// `intersect` — area covered by every child
// `exclude`   — symmetric difference (XOR)
export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";