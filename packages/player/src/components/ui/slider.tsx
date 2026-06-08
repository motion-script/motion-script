import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

function Slider({
    id,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
}: SliderProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className={cn("relative flex h-5 w-full items-center", className,disabled && "opacity-50")}>
      {/* Visual track */}
      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-input">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Native range input — transparent overlay, handles all interaction */}
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.valueAsNumber)}
        className={cn(
          "relative h-full w-full hover:cursor-pointer appearance-none opacity-0",
          "disabled:cursor-not-allowed"
        )}
      />

      {/* Visual thumb — follows value, pointer-events-none so the input captures drags */}
      <div
        className={cn(
          "pointer-events-none  absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2",
          "rounded-full border-2 border-primary bg-background shadow transition-shadow",
          
        )}
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
}

export { Slider };
