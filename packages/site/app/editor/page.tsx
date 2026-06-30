import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Editor — MotionScript',
  description:
    'A web-based editor to sync your code-driven animations with audio, all in your browser.',
}

export default function EditorPage() {
  // The player is built as a fully self-contained static app into
  // packages/site/public/player/ (see packages/player/vite.config.app.ts) and
  // served at /player/index.html. We embed it in an iframe so it runs in a
  // completely isolated browsing context — its own React tree, its own
  // CanvasKit/wasm worker, and its own cross-origin-isolated headers — without
  // any chance of clashing with the Next.js runtime or styles.
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <iframe
        src="/player/index.html"
        title="MotionScript Editor"
        className="absolute inset-0 h-full w-full border-0"
        // CanvasKit decodes media in a worker that relies on SharedArrayBuffer,
        // which requires the embedded document to be cross-origin isolated. The
        // COOP/COEP headers are set in next.config.ts (and must be mirrored by
        // the production host); this just lets the iframe opt in.
        allow="cross-origin-isolated; autoplay; fullscreen"
      />
    </div>
  )
}
