/**
 * Self-contained HTML report builder for the screenshot comparison.
 *
 * Every image is inlined as a base64 data URI so the single report.html opens
 * anywhere with no sidecar files — including when copied out of the Docker
 * container that produced it. Failing rows (a frame over the mismatch threshold,
 * a dimension mismatch, or a frame missing on one side) are highlighted and
 * sorted to the top.
 */
import fs from 'node:fs';
import type { FrameLabel } from './frames.ts';

export interface FrameResult {
    label: FrameLabel;
    /** ok = diffed cleanly; fail = structural problem (dimensions); missing = absent on a side. */
    status: 'ok' | 'fail' | 'missing';
    /** Share of changed pixels, 0–100. */
    mismatch: number;
    note?: string;
    stablePath?: string;
    libPath?: string;
    diffPath?: string;
    /** Set by compare.ts once the threshold is applied. */
    failed?: boolean;
}

export interface SceneReport {
    id: string;
    section: string;
    description: string;
    frames: FrameResult[];
    failed: boolean;
}

export interface ReportData {
    threshold: number;
    totalScenes: number;
    failedScenes: number;
    totalFrames: number;
    failedFrames: number;
    generatedAt: string;
    scenes: SceneReport[];
}

/** Read an image file as a base64 data URI, or null if absent. */
function dataUri(filePath: string | undefined): string | null {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const b64 = fs.readFileSync(filePath).toString('base64');
    return `data:image/png;base64,${b64}`;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
    );
}

function cell(uri: string | null, alt: string): string {
    return uri
        ? `<img loading="lazy" src="${uri}" alt="${escapeHtml(alt)}">`
        : `<div class="empty">—</div>`;
}

function frameRow(r: FrameResult): string {
    const cls = r.failed ? 'frame failed' : 'frame';
    const metric =
        r.status === 'missing'
            ? escapeHtml(r.note ?? 'missing')
            : r.status === 'fail'
              ? escapeHtml(r.note ?? 'fail')
              : `${r.mismatch.toFixed(3)}%`;
    return `
      <div class="${cls}">
        <div class="frame-head"><span class="label">${r.label}</span><span class="metric">${metric}</span></div>
        <div class="imgs">
          <figure>${cell(dataUri(r.stablePath), `stable ${r.label}`)}<figcaption>stable</figcaption></figure>
          <figure>${cell(dataUri(r.libPath), `lib ${r.label}`)}<figcaption>lib</figcaption></figure>
          <figure>${cell(dataUri(r.diffPath), `diff ${r.label}`)}<figcaption>diff</figcaption></figure>
        </div>
      </div>`;
}

function sceneCard(s: SceneReport): string {
    const worst = Math.max(0, ...s.frames.map(f => (f.status === 'ok' ? f.mismatch : 100)));
    return `
    <section class="scene ${s.failed ? 'scene-failed' : 'scene-ok'}">
      <header>
        <h3>${escapeHtml(s.id)} ${s.failed ? '<span class="badge bad">DIFF</span>' : '<span class="badge ok">match</span>'}</h3>
        <p class="meta"><span class="section">${escapeHtml(s.section)}</span> · worst ${worst.toFixed(3)}%</p>
        ${s.description ? `<p class="desc">${escapeHtml(s.description)}</p>` : ''}
      </header>
      ${s.frames.map(frameRow).join('')}
    </section>`;
}

export function buildReportHtml(data: ReportData): string {
    // Failing scenes first, then by id, so regressions are at the top.
    const sorted = [...data.scenes].sort((a, b) =>
        a.failed === b.failed ? a.id.localeCompare(b.id) : a.failed ? -1 : 1,
    );
    const pass = data.failedScenes === 0;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Motion Script E2E — stable vs lib</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background: #0d0f15; color: #c9d1e0; }
  header.top { position: sticky; top: 0; z-index: 5; padding: 18px 24px;
               background: #11141d; border-bottom: 1px solid #232838; }
  header.top h1 { margin: 0 0 6px; font-size: 18px; color: #f4f6ff; }
  .summary { display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px; }
  .summary b { color: #f4f6ff; }
  .status { font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .status.pass { background: #11321f; color: #54e08a; }
  .status.fail { background: #3a1620; color: #ff7591; }
  main { padding: 20px 24px; display: grid; gap: 18px; }
  .scene { border: 1px solid #232838; border-radius: 12px; padding: 14px 16px; background: #11141d; }
  .scene-failed { border-color: #6b2233; background: #170f14; }
  .scene header { margin-bottom: 10px; }
  .scene h3 { margin: 0; font-size: 15px; color: #f4f6ff; display: flex; align-items: center; gap: 10px; }
  .meta { margin: 2px 0 0; font-size: 12px; color: #7d869c; }
  .meta .section { color: #9aa4bf; }
  .desc { margin: 4px 0 0; font-size: 12px; color: #8b93a9; }
  .badge { font-size: 11px; padding: 1px 8px; border-radius: 999px; font-weight: 700; }
  .badge.ok { background: #11321f; color: #54e08a; }
  .badge.bad { background: #3a1620; color: #ff7591; }
  .frame { border-top: 1px solid #1d2230; padding: 10px 0; }
  .frame.failed { background: #1a1014; }
  .frame-head { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
  .frame-head .label { text-transform: uppercase; letter-spacing: .05em; color: #9aa4bf; }
  .frame-head .metric { font-variant-numeric: tabular-nums; color: #c9d1e0; }
  .frame.failed .metric { color: #ff7591; font-weight: 700; }
  .imgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  figure { margin: 0; }
  figure img { width: 100%; height: auto; display: block; border-radius: 6px;
               background: repeating-conic-gradient(#1b2030 0% 25%, #161a21 0% 50%) 50% / 20px 20px; }
  figcaption { font-size: 11px; color: #7d869c; text-align: center; margin-top: 4px; }
  .empty { aspect-ratio: 16/9; display: grid; place-items: center; color: #4a5468;
           border: 1px dashed #2a3142; border-radius: 6px; }
</style>
</head>
<body>
<header class="top">
  <h1>Motion Script E2E — <span class="status ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</span></h1>
  <div class="summary">
    <span><b>${data.totalScenes - data.failedScenes}/${data.totalScenes}</b> scenes match</span>
    <span><b>${data.totalFrames - data.failedFrames}/${data.totalFrames}</b> frames within ${data.threshold}%</span>
    <span>threshold <b>${data.threshold}%</b> changed pixels</span>
    <span>generated ${escapeHtml(data.generatedAt)}</span>
  </div>
</header>
<main>
  ${sorted.map(sceneCard).join('')}
</main>
</body>
</html>
`;
}
