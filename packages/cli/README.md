# @motion-script/cli

The headless renderer for [Motion Script](https://motionscript.dev) projects,
and the only build tooling a project needs — it supplies its own Vite setup, so
your project has no bundler configuration of its own. Renders scenes to video or
still frames, which makes it a good fit for local iteration, CI and batch
exports.

```bash
ms export --scenes intro,outro --split
```

## Commands

```
ms list                       List the scenes in the current project
ms export [options]           Render scenes to MP4 in ./out/videos
ms screenshot <when> [opts]   Capture a single frame to ./out/screenshots
ms clear                      Delete exported videos and screenshots from ./out
```

### Export options

| Flag | Description |
| --- | --- |
| `--scenes <a,b,c>` | Comma-separated scene names to export (default: all) |
| `--split` | Export each scene as its own file (default: combine into one) |
| `--scale <n>` | Resolution multiplier, e.g. `2` for 2x (default: `1`) |
| `--out <dir>` | Output directory (default: `out`) |

### Screenshot

`ms screenshot <when>` — `<when>` is a frame number, a time, `first`, or
`last`. A bare integer is a frame (e.g. `42`); a decimal or a value with an
`s` suffix is a time in seconds (e.g. `2.5` or `2.5s`).

| Flag | Description |
| --- | --- |
| `--split` | Capture `<when>` for each scene separately instead of against the combined timeline |
| `--scenes <a,b,c>` | Scenes whose timeline the frame is taken from (default: all) |
| `--scale <n>` | Resolution multiplier (default: `1`) |
| `--format <png\|jpg>` | Image format (default: `png`) |
| `--out <dir>` | Output directory (default: `out`) |

### Examples

```bash
ms list
ms export --scenes intro,outro --split
ms export --scenes intro --scale 2
ms screenshot last
ms screenshot first --split
ms screenshot 42 --format jpg
ms screenshot 2.5s --scenes intro --scale 2
ms clear
```

## Usage

```bash
npm install @motion-script/cli
```

The binary is installed as both `ms` and `motion-script`. Run it from a
Motion Script project directory (one scaffolded with `npm create
motion-script@latest`, or any project with a `src/project.ts`). `vite` is a peer
dependency; the scaffolded templates already declare it.

See the [docs](https://motionscript.dev/docs) for the full feature set and API
reference.

## Development

The package has two halves. `src/` is compiled by `tsc` into `dist/` and runs in
Node (the binary, the Playwright driver, the Vite plugin). `harness/` is the tiny
browser app Vite serves from source at render time — it is never compiled, so
editing it needs no rebuild.

From the monorepo root, after changing `src/`:

```bash
pnpm --filter @motion-script/cli build
```
