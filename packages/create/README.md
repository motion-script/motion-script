# @motion-script/create

Scaffold a new [Motion Script](https://motionscript.dev) project with a single
command. It copies a starter template, wires up the Vite plugin, and pins the
`@motion-script` packages to matching versions so you can start animating right
away.

```bash
npm create motion-script@latest
```

You'll be prompted for a project name, a target directory, and whether to use
TypeScript or JavaScript.

## Usage

With your package manager of choice:

```bash
npm create motion-script@latest
# or
pnpm create motion-script
# or
yarn create motion-script
```

Then follow the printed instructions:

```bash
cd my-video
npm install
npm run dev
```

## Options

Skip the prompts by passing answers as flags:

```bash
npm create motion-script@latest -- --name my-video --path ./my-video --language ts
```

- `--name` — the project (npm package) name.
- `--path` — the target directory. Must be empty if it already exists.
- `--language` — `ts` (default) or `js`.

## Templates

- `template-ts` — TypeScript starter (recommended).
- `template-js` — JavaScript starter.

Both come preconfigured with the Motion Script Vite plugin and an example scene.

See the [docs](https://motionscript.dev/docs) for the full feature set and API
reference.

## Development

This package is plain Node ESM with no build step — `index.js` is the published
entry point. To try it locally from the monorepo:

```bash
node packages/create/index.js
```
