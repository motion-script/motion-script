import { MIN_LABEL_SPACING_PX } from "./constants";

// Nice step sequence for frame labels: 1, 2, 5, 10, 20, 50, 100, ...
export function pickMajorStep(pxPerUnit: number): number {
  const minStepUnits = MIN_LABEL_SPACING_PX / Math.max(pxPerUnit, 0.0001);
  if (minStepUnits <= 1) return 1;
  const pow10 = Math.pow(10, Math.floor(Math.log10(minStepUnits)));
  const norm = minStepUnits / pow10;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * pow10;
}

export function formatRulerLabel(frame: number, fps: number, showFrames: boolean): string {
  if (showFrames) return `${frame}f`;
  const totalSeconds = frame / fps;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  return `${s.toFixed(1)}s`;
}
