import React from 'react';
import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import BrowserOnly from '@docusaurus/BrowserOnly';

export default function Editor(): ReactNode {
  // The player is built as a fully self-contained static app into
  // packages/docs/static/player/ (see packages/player/vite.config.app.ts) and
  // served at /player/index.html. We embed it in an iframe so it runs in a
  // completely isolated browsing context — its own React tree, its own
  // CanvasKit/wasm worker, and its own cross-origin-isolated headers — without
  // any chance of clashing with Docusaurus's runtime or styles.
  const playerUrl = useBaseUrl('/player/index.html');

  return (
    <Layout
      title="Editor — MotionScript"
      description="A web-based editor to sync your code-driven animations with audio, all in your browser."
      wrapperClassName="home-page"
      noFooter
    >
      <div className="relative h-[calc(100vh-var(--ifm-navbar-height))] w-full bg-[var(--background)] overflow-hidden">
        <BrowserOnly fallback={<EditorFallback />}>
          {() => (
            <iframe
              src={playerUrl}
              title="MotionScript Editor"
              className="absolute inset-0 h-full w-full border-0"
              // CanvasKit decodes media in a worker that relies on
              // SharedArrayBuffer, which requires the embedded document to be
              // cross-origin isolated. The headers are set by the docs site
              // (see docusaurus.config.ts); this just lets the iframe opt in.
              allow="cross-origin-isolated; autoplay; fullscreen"
            />
          )}
        </BrowserOnly>
      </div>
    </Layout>
  );
}

function EditorFallback(): ReactNode {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="text-sm text-[var(--muted-foreground)]">Loading editor…</p>
    </div>
  );
}
