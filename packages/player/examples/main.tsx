import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { PlayerApp } from '../src/index'
import { createProject } from '@motion-script/core'
import layoutScene from './scenes/shape'
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import flowMorph from './scenes/flow-morph'
import rectWithChildren from './scenes/rect-with-children'

const scenes = [
  layoutScene,
  flowMorph,
  rectWithChildren
];

const project = createProject({
  name: 'My Video',
  scenes,
  viewport: {
    height: 1080,
    width: 1920,
  },
  theme: {
    'bg': '#0D0F15',
    'card': '#161a21',
    'primary': '#6990DD'
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerApp config={project} wasmUrl={wasmUrl} />
  </StrictMode>,
)
