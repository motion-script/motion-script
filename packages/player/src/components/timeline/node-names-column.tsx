import { ChevronRight } from "lucide-react";
import { INDENT_PX, NODE_LIST_WIDTH, NODE_ROW_HEIGHT } from "./constants";
import type { FlatNode } from "./flatten";
import { NodeIcon } from "./node-icon";
import type { RowWindow } from "./use-row-virtualizer";

interface NodeNamesColumnProps {
  nodes: FlatNode[];
  window: RowWindow;
  collapsed: Set<string>;
  selectedNodeId?: string;
  onMeasure: (el: HTMLDivElement | null) => void;
  onScroll: (scrollTop: number) => void;
  scrollRef: (el: HTMLDivElement | null) => void;
  onToggle: (id: string) => void;
  onNavigate: (id: string) => void;
}

// Left column listing node names. Only the rows inside `window` are rendered;
// a full-height spacer keeps the scrollbar geometry correct.
export function NodeNamesColumn({
  nodes,
  window,
  collapsed,
  selectedNodeId,
  onMeasure,
  onScroll,
  scrollRef,
  onToggle,
  onNavigate,
}: NodeNamesColumnProps) {
  const { startIndex, endIndex, totalHeight } = window;
  const visible = nodes.slice(startIndex, endIndex);

  return (
    <div
      ref={(el) => { scrollRef(el); onMeasure(el); }}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      className="shrink-0 border-r border-border bg-panel overflow-y-auto overflow-x-hidden no-scrollbar"
      style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((node, vi) => {
          const i = startIndex + vi;
          const isSelected = node.id === selectedNodeId;
          return (
            <div
              key={node.id}
              className={`group flex items-center gap-1 select-none border-b border-border/40 ${isSelected
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              style={{
                position: "absolute",
                top: i * NODE_ROW_HEIGHT,
                left: 0,
                width: NODE_LIST_WIDTH,
                height: NODE_ROW_HEIGHT,
                paddingLeft: 8 + node.depth * INDENT_PX,
                paddingRight: 8,
                boxSizing: "border-box",
              }}
            >
              <span
                className={`flex items-center justify-center shrink-0 rounded transition-colors ${node.hasChildren
                  ? "cursor-pointer hover:bg-border text-muted-foreground hover:text-foreground"
                  : "pointer-events-none opacity-0"
                  }`}
                style={{ width: 18, height: 18 }}
                onClick={(e) => {
                  if (!node.hasChildren) return;
                  e.stopPropagation();
                  onToggle(node.id);
                }}
              >
                <ChevronRight
                  size={16}
                  className="transition-transform duration-150"
                  style={{ transform: collapsed.has(node.id) ? "rotate(0deg)" : "rotate(90deg)" }}
                />
              </span>

              <span className="shrink-0 flex items-center opacity-60" style={{ width: 14, height: 14, fontSize: 14 }}>
                <NodeIcon type={node.type} />
              </span>

              <button
                className={`text-xs ml-1 text-left cursor-pointer ${isSelected ? "text-primary font-medium" : "text-inherit"}`}
                style={{ background: "none", border: "none", padding: 0 }}
                onClick={() => onNavigate(node.id)}
                title={node.type}
              >
                {node.type}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
