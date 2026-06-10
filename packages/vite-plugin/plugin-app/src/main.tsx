// Headless mode (`?headless`) is driven by the @motion-script/cli package: it
// loads this page in a headless browser, then calls the bridge installed on
// `window.__motionScript` to list/export scenes. We skip mounting the React
// player in that case — the bridge alone is needed, and the player's UI would
// just be dead weight (and noise) in an offscreen render.
const isHeadless = new URLSearchParams(window.location.search).has('headless')

if (isHeadless) {
  const { installHeadlessBridge } = await import('./headless.ts')
  installHeadlessBridge()
} else {
  const { StrictMode } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { default: App } = await import('./App.tsx')

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
