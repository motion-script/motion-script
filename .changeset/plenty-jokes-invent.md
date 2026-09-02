---
"@motion-script/engine": minor
---

New package: `@motion-script/engine`, for rendering projects to video and stills from a Node server

The headless renderer, packaged for backend use rather than for a terminal. `createEngine({ projectRoot })` boots the project's own Vite server and a pool of headless Chromium pages once and keeps them warm, so a render is a request rather than a process start — the dependency optimization, WASM compile and page start-up are paid at boot instead of per job.

```ts
const engine = await createEngine({ projectRoot: '/srv/projects/promo', concurrency: 2 });
const [clip] = await engine.renderVideo({ scenes: ['intro'], scale: 2, signal: req.signal });
const still = await engine.renderImage({ at: '2.5s', format: 'jpg' });
```

It renders through the exact pipeline the interactive player uses, so a server-side render matches what the author previewed. What it adds is what a service needs around that: bounded concurrency with a FIFO queue, per-job `AbortSignal` cancellation and timeouts (an aborted render's page is retired, so the work really stops), `EngineError` codes that map onto responses (`UNKNOWN_SCENE` and `INVALID_OPTION` are 400s, `TIMEOUT` a 504), clip-at-a-time streaming via `onClip` so a long split render never sits in memory whole, and no output of its own unless you pass a `logger`. The option parsers are exported too, so a request body can be rejected at the edge rather than mid-render.

`@motion-script/cli` is now a thin front end over the engine: the Vite server, Chromium launch flags, page pool and bridge protocol have one definition instead of two, and `ms` gains the engine's start-up retry. `HeadlessDriver` keeps its existing shape and behaviour for the batch scripts that drive it; new code should use the engine directly. `playwright` moves from a direct CLI dependency to a transitive one.
