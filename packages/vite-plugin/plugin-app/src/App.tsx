import { useEffect, useState } from 'react'
import type { ProjectConfig } from '@motion-script/player'
import config from '~user-project'
import assets from '~asset-manifest'
import { PlayerApp } from '@motion-script/player';
import '@motion-script/player/style.css';

// The mounted App registers its state setter here so the module-level HMR
// handler below can push a freshly-edited project into the live React tree
// without a remount.
let pushConfig: ((config: ProjectConfig) => void) | null = null

// Accept HMR updates for the user's project module ourselves. This MUST live at
// module top level (not inside the component) so it's registered once.
//
// Why this matters: App.tsx imports PlayerApp from @motion-script/player, which
// Vite pre-bundles into an opaque optimized chunk when the plugin is installed
// from npm (it has to be optimized so its CommonJS dep use-sync-external-store
// resolves as ESM). React Fast Refresh can't form a component boundary across
// that opaque import, so a change to '~user-project' would otherwise bubble up
// to a full page reload — remounting everything and snapping the timeline back
// to 0s. In the monorepo the player is a linked (un-bundled) dep, so the
// boundary held and the bug never appeared. By self-accepting '~user-project'
// here, a scene edit becomes a plain data swap: we hand the new config to the
// already-mounted player, whose editor store keeps the user on the same
// scene/frame (see resetConfig) instead of reloading.
if (import.meta.hot) {
  import.meta.hot.accept('~user-project', (mod) => {
    if (mod?.default) pushConfig?.(mod.default)
  })
}

function App() {
  const [project, setProject] = useState<ProjectConfig>(config)

  useEffect(() => {
    pushConfig = setProject
    return () => { pushConfig = null }
  }, [])

  return <PlayerApp config={project} wasmUrl="/canvaskit.wasm" assets={assets} />
}

export default App
