import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { PlayerApp } from '../src/index'
import { createProject } from '@motion-script/core'
import { LayoutScene } from './scenes/shape'
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";

const scenes = [
  new LayoutScene(),
];

const project = createProject({
  name: 'My Video',
  scenes,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerApp config={project} wasmUrl={wasmUrl} />
  </StrictMode>,
)
