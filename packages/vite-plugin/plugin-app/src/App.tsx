import config from '~user-project'
import assets from '~asset-manifest'
import { PlayerApp } from '@motion-script/player';
import '@motion-script/player/style.css';


function App() {

  return <PlayerApp config={config} wasmUrl="/canvaskit.wasm" assets={assets} />
}

export default App
