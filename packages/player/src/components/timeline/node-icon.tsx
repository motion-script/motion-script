// Small glyph representing a node's type in the names column. The first three
// cases are the project-level rows (see `globalRows`), which have no node type.
export function NodeIcon({ type }: { type: string }) {
  switch (type) {
    case "background": return <span>▩</span>;
    case "overlay": return <span>▤</span>;
    case "audio": return <span>🔊</span>;
    case "camera": return <span>🎥</span>;
    case "text": return <span>T</span>;
    case "rect": return <span>▭</span>;
    case "ellipse": return <span>◯</span>;
    default: return <span>◆</span>;
  }
}
