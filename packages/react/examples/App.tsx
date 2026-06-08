
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { ScriptEmbed } from "./embed";
import { MotionScriptProvider } from "../src/ui/provider";
import { ExpensiveScene } from "./scenes/expensive";

const youtubeRes = { width: 1920, height: 1080 };
const scenes = [new ExpensiveScene(),];

export function App() {
    return (
        <MotionScriptProvider wsmUrl={wasmUrl}>
            <div className="app-shell">
                <ScriptEmbed viewport={youtubeRes} theme={{
                    'bg': '#1e1f21',
                    'card': '#2b2d30'
                }} fps={60} scenes={scenes} assets={{
                    image: {
                        'background.jpg': {
                            sizeBytes: 501375,
                            src: './background.jpg',
                            width: 2880,
                            height: 1800

                        }
                    },
                    video: {
                        'video.mp4': {
                            sizeBytes: 14220122,
                            duration: 11,
                            src: './video.mp4',
                            width: 1080,
                            height: 1080

                        }
                    },
                    audio: {
                        "click.mp3": {
                            sizeBytes: 38552,
                            src: "./click.mp3",
                            duration: 0.5,

                        },
                        "song.mp3": {
                            sizeBytes: 4237270,
                            src: "./song.mp3",
                            duration: 132,

                        }
                    },
                    font: {
                        'Roboto@400': {
                            fontFamily: 'Roboto',
                            fontWeight: 400,
                            src: './Roboto-Regular.ttf',
                            sizeBytes: 159108
                        }
                    }
                }} />
            </div>
        </MotionScriptProvider>
    );
}
