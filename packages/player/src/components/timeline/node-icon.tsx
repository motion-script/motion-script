// Small glyph representing a node's type in the names column.
export function NodeIcon({ type }: { type: string }) {
  switch (type) {
    case "audio": return <span>🔊</span>;
    case "camera": return <span>🎥</span>;
    case "text": return <span>T</span>;
    case "rect": return <span>▭</span>;
    case "ellipse": return <span>◯</span>;
    default: return <span>◆</span>;
  }
}
