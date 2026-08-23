# @motion-script/engine

Render [Motion Script](https://motionscript.dev) projects to video and stills
from a Node process. This is the library behind `@motion-script/cli` — packaged
for servers, so a render can be a request rather than a command.

```ts
import { createEngine } from '@motion-script/engine';

const engine = await createEngine({ projectRoot: '/srv/projects/promo', concurrency: 2 });

const [clip] = await engine.renderVideo({ scenes: ['intro'], scale: 2 });
const still = await engine.renderImage({ at: '2.5s', format: 'jpg' });

await engine.close();
```

The engine boots the project's own Vite dev server and a pool of headless
Chromium pages, then drives the same export pipeline the interactive player
uses — so what your server renders is exactly what the author previewed. Both
stay warm: the expensive parts (dependency optimization, WASM compile, page
start-up) are paid once at boot instead of once per request.

## Install

```bash
npm install @motion-script/engine
npx playwright install --with-deps chromium
```

`vite` is a peer dependency, and the project you render must have
`@motion-script/vite-plugin` in its own `vite.config` — the same setup
`npm create motion-script@latest` scaffolds.

## Built for a service

| | |
| --- | --- |
| **Bounded concurrency** | `concurrency` pages, a FIFO queue behind them. Renders past the limit wait instead of piling onto the GPU. |
| **Cancellation** | Every call takes an `AbortSignal`. An aborted render's page is retired, so the work really stops. |
| **Timeouts** | A per-job budget, defaulting to 15 minutes, so one pathological scene cannot hold a worker forever. |
| **Coded errors** | Every failure is an `EngineError` with a `code`, so a bad scene name answers 400 and a dead browser answers 500. |
| **Streaming output** | `onClip` delivers each clip the moment its encode finishes; with `collect: false` a long split render never sits in memory whole. |
| **Silent by default** | Nothing is written to stdout or stderr unless you pass a `logger`. |
| **Edge validation** | The same parsers the engine uses are exported, so a request body can be rejected before it costs a worker. |

## Rendering video

```ts
const clips = await engine.renderVideo({
    scenes: ['intro', 'demo'],   // omitted → every scene
    split: true,                 // one clip per scene; false concatenates them
    scale: 2,                    // resolution multiplier
    codec: 'hevc',               // 'avc' (default) | 'hevc' | 'av1' | 'vp9'
    bitrate: '40M',              // bits per second; k / M suffixes accepted
    supersample: 2,              // render n× and downsample; n² the render time
    onProgress: ({ scene, progress }) => report(scene, progress),
    signal: request.signal,
});

for (const clip of clips) await upload(clip.scene, clip.bytes);
```

To keep a large split render out of memory, take delivery as each clip lands:

```ts
await engine.renderVideo({
    split: true,
    collect: false,              // the resolved array is then empty, by design
    onClip: clip => upload(clip.scene, clip.bytes),   // awaited before the next scene
});
```

## Rendering stills

`at` addresses the combined timeline of the selected scenes:

```ts
await engine.renderImage({ at: 'last' });                       // the project's final frame
await engine.renderImage({ scenes: ['intro'], at: 'last' });    // that scene's final frame
await engine.renderImage({ at: 150 });                          // frame 150
await engine.renderImage({ at: '2.5s' });                       // 2.5 seconds in
await engine.renderImage({ at: { seconds: 2.5 } });             // the same, said explicitly
```

A `number` is always a frame index. Seconds must be said as `'2.5s'` or
`{ seconds: 2.5 }`, so a computed `duration * 0.5` can never quietly change
units. Strings go through the same parser the CLI uses, which is what makes a
query parameter safe to pass straight through.

For a still of every scene, fan out — the pool decides how many actually run at
once:

```ts
const { scenes } = await engine.projectInfo();
const stills = await Promise.all(
    scenes.map(scene => engine.renderImage({ scenes: [scene], at: 'first' })),
);
```

## Errors

Every failure is an `EngineError` carrying a `code`, so a handler can map
outcomes without matching on message text:

```ts
import { isEngineError } from '@motion-script/engine';

try {
    const still = await engine.renderImage({ scenes: [req.query.scene], at: req.query.at });
    res.type('image/png').send(still.bytes);
} catch (err) {
    if (!isEngineError(err)) throw err;
    const status = {
        PROJECT_NOT_FOUND: 404, INVALID_OPTION: 400, UNKNOWN_SCENE: 400,
        ABORTED: 499, TIMEOUT: 504, CLOSED: 503,
    }[err.code] ?? 500;
    res.status(status).json({ error: err.code, message: err.message });
}
```

`START_FAILED`, `BRIDGE_TIMEOUT`, `BRIDGE_INCOMPATIBLE` and `RENDER_FAILED`
cover the server-side half: a Chromium that will not launch, a project page
that never came up, a stale `@motion-script/vite-plugin` in the project, and a
scene that threw mid-render.

To reject bad input before it costs a worker, use the same parsers the engine
does — `parseFrameSelector`, `parseCodec`, `parseBitrate`, `parseImageFormat`,
`parseScale`, `parseSupersample`, `parseSceneNames`. Each throws
`INVALID_OPTION` with a message naming the value it refused.

## Options

| Option | Default | |
| --- | --- | --- |
| `projectRoot` | `process.cwd()` | The project to render — a directory with `src/project.ts`. |
| `concurrency` | `1` | Renders in flight at once. Each is a page with its own GPU context. |
| `timeout` | `900000` | Per-job budget in ms. `0` disables it. |
| `startTimeout` | `60000` | How long a page gets to install the bridge. |
| `startAttempts` | `3` | Retries for a page start-up, which covers the cold dependency-cache race. |
| `softwareRender` | `MS_SOFTWARE_RENDER=1` | Render through SwiftShader instead of a GPU. |
| `chromiumArgs` / `executablePath` | — | Chromium flags, and a browser binary of your own. |
| `port` | ephemeral | Port for the internal Vite server. |
| `viteLogLevel` | `'warn'` | Verbosity of that server. |
| `logger` | silent | Where page errors, pool churn and restarts go. |

## Running it in production

**Containers need `softwareRender`.** The renderer draws every frame through a
GPU Skia surface, so a real GPU is worth a lot — but on a host without one,
*asking* for hardware acceleration fails to create a WebGL context rather than
degrading. Set `MS_SOFTWARE_RENDER=1` (or `softwareRender: true`) wherever there
is no GPU, and start from Playwright's own image so Chromium's system libraries
are present:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.61.1-noble
ENV MS_SOFTWARE_RENDER=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

**One engine per project.** An engine is bound to one project root. Serving
several means one engine each; they are independent and run side by side in a
single process.

**Rendering a project that is not the working directory.** The Vite plugin
resolves the user's entry, `project.ts` and `public/` from `process.cwd()`, so
the engine briefly `chdir`s into the project while the config loads and restores
the directory afterwards. Concurrent starts are queued so they cannot interleave,
and the process never observes a changed cwd once `start()` resolves. Two
consequences: an engine cannot be started from a worker thread that is not
already in the project directory (worker threads have no `chdir` — it throws
`START_FAILED` saying so), and a process that changes its own cwd mid-start
races the guard.

**Memory.** Encoded bytes cross the browser bridge base64-encoded, so a clip
exists in memory twice around delivery. Stream with `onClip` and
`collect: false` for long renders, and size the container against your longest
one rather than your typical one.

**Picking up an edit.** The internal server runs with HMR off and every page
holds the modules it loaded, so a project edited on disk needs
`await engine.restart()` to take effect.

## API

- `createEngine(options)` — construct and boot; equivalent to `new MotionScriptEngine(options).start()`.
- `engine.renderVideo(options)` → `VideoClip[]`
- `engine.renderImage(options)` → `RenderedImage`
- `engine.projectInfo()` → `{ name, fps, scenes }` · `engine.listScenes()` → `string[]`
- `engine.warm(count?)` — open pages ahead of demand.
- `engine.stats` — `{ started, sessions, queued, concurrency }`, for a health endpoint.
- `engine.restart()` · `engine.close()`

## Relationship to the CLI

`@motion-script/cli` is a thin front end over this package: `ms export` and
`ms screenshot` parse flags, then call the same engine. Use the CLI for a
terminal or a CI step; use the engine when renders are triggered by something
other than a person typing.

## License

Apache-2.0
