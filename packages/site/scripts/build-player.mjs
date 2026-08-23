// Build the standalone player app bundle that /editor embeds at
// /player/index.html (see packages/player/vite.config.app.ts, which writes
// straight into this package's public/player/).
//
// This has to shell out to the *monorepo root*: packages/site declares its own
// `pnpm-workspace.yaml` with `packages: []` so it can be installed standalone by
// the deployment host. A `pnpm --filter @motion-script/player …` run from here
// therefore matches zero projects — and pnpm exits 0 when a filter matches
// nothing, so the player silently never got built and /editor 404'd on its
// iframe. Running with the root as cwd puts the real workspace in scope, and we
// assert the output exists afterwards so a future regression fails loudly.

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.resolve(siteRoot, "..", "..")
const playerRoot = path.join(repoRoot, "packages", "player")
const outIndex = path.join(siteRoot, "public", "player", "index.html")

if (!fs.existsSync(path.join(playerRoot, "package.json"))) {
  // Site-only checkout (no monorepo around it). Nothing we can do; make it a
  // hard error rather than shipping an /editor page that 404s.
  console.error(
    `[build:player] @motion-script/player not found at ${playerRoot}. ` +
      `The /editor page embeds its build output and cannot be produced from a ` +
      `site-only checkout.`,
  )
  process.exit(1)
}

// Drive Vite's JS entry with the current Node binary rather than shelling out to
// `pnpm`/`vite` — the package-manager and .bin shims are .cmd files on Windows,
// which spawn can't exec without `shell: true`.
const viteBin = path.join(playerRoot, "node_modules", "vite", "bin", "vite.js")
if (!fs.existsSync(viteBin)) {
  console.error(
    `[build:player] vite is not installed in packages/player — run \`pnpm install\` at ${repoRoot}.`,
  )
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [viteBin, "build", "--config", "vite.config.app.ts"],
  { cwd: playerRoot, stdio: "inherit" },
)

if (result.error || result.status !== 0) {
  console.error(`[build:player] player app build failed.`, result.error ?? "")
  process.exit(result.status || 1)
}

if (!fs.existsSync(outIndex)) {
  console.error(
    `[build:player] player build reported success but ${path.relative(siteRoot, outIndex)} ` +
      `is missing — /editor would 404.`,
  )
  process.exit(1)
}
