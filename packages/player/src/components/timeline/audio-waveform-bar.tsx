import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

interface DecodedPeaks {
  /** Single-channel peak samples, normalized to [-1, 1]. */
  peaks: number[];
  /** Clip length in seconds. */
  duration: number;
}

// Decoding an audio file is the slow part (fetch + decodeAudioData), and the
// timeline remounts/resizes bars constantly while scrolling and zooming. Decode
// each URL exactly once and cache its peaks so every later render is instant and
// never refetches. In-flight decodes are cached too, so concurrent bars for the
// same clip share one request.
const peaksCache = new Map<string, Promise<DecodedPeaks>>();
// Resolved decodes, kept alongside the promise cache so a freshly-mounted bar
// for an already-decoded clip can render synchronously with no loading flash.
const resolvedPeaks = new Map<string, DecodedPeaks>();

function peaksCacheValue(url: string): DecodedPeaks | null {
  return resolvedPeaks.get(url) ?? null;
}

// Number of peak buckets to extract. Generous enough to look crisp at any zoom
// the timeline supports without holding the full PCM buffer in memory.
const PEAK_BUCKETS = 2000;

let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext {
  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

async function loadPeaks(url: string): Promise<DecodedPeaks> {
  const existing = peaksCache.get(url);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.max(1, Math.floor(channel.length / PEAK_BUCKETS));
    const peaks: number[] = [];
    for (let i = 0; i < channel.length; i += samplesPerBucket) {
      let max = 0;
      const end = Math.min(i + samplesPerBucket, channel.length);
      for (let j = i; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const result = { peaks, duration: audioBuffer.duration };
    resolvedPeaks.set(url, result);
    return result;
  })();

  // Drop failed decodes from the cache so a transient error can be retried.
  promise.catch(() => peaksCache.delete(url));
  peaksCache.set(url, promise);
  return promise;
}

// Renders an audio file's waveform into a fixed-size box using WaveSurfer, with
// the clip's name shown above it. Peaks are decoded once per URL and cached, so
// the waveform appears instantly on remount/resize without refetching.
export function AudioWaveformBar({
  url,
  width,
  height,
  name,
}: {
  url: string;
  width: number;
  height: number;
  name?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [decoded, setDecoded] = useState<DecodedPeaks | null>(
    () => peaksCacheValue(url),
  );

  // Reserve a fixed strip for the label and give the rest to the waveform so the
  // two stack vertically instead of overlapping.
  const labelHeight = name ? 11 : 0;
  const waveHeight = Math.max(1, height - labelHeight);

  // Kick off (or reuse) the decode for this URL and adopt its peaks when ready.
  useEffect(() => {
    let cancelled = false;
    const cached = peaksCacheValue(url);
    if (cached) {
      setDecoded(cached);
      return;
    }
    setDecoded(null);
    loadPeaks(url).then((d) => { if (!cancelled) setDecoded(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  // Render from the cached peaks — no network/decode here, so resizing and
  // zooming (which change width) repaint instantly.
  useEffect(() => {
    if (!containerRef.current || width <= 0 || !decoded) return;
    const cs = getComputedStyle(document.documentElement);
    const waveColor = cs.getPropertyValue("--muted-foreground").trim() || "currentColor";
    wsRef.current?.destroy();
    wsRef.current = WaveSurfer.create({
      container: containerRef.current,
      peaks: [decoded.peaks],
      duration: decoded.duration,
      waveColor,
      progressColor: waveColor,
      cursorWidth: 0,
      height: waveHeight,
      barWidth: 1,
      barGap: 1,
      normalize: true,
      interact: false,
    });
    return () => { wsRef.current?.destroy(); wsRef.current = null; };
  }, [decoded, width, waveHeight]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width, height, overflow: "hidden" }}>
      {name && (
        <span
          className="text-card-foreground"
          style={{
            height: labelHeight,
            paddingLeft: 4,
            paddingRight: 4,
            fontSize: 9,
            fontWeight: 600,
            lineHeight: `${labelHeight}px`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
            opacity: 0.85,
          }}
          title={name}
        >
          {name}
        </span>
      )}
      <div ref={containerRef} style={{ width, height: waveHeight }} />
    </div>
  );
}
