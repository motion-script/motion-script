import fs from "node:fs"
import path from "node:path"
import type { NextConfig } from "next"

// Read the engine's published version from @motion-script/core's package.json
// (Node-only context here) and inline it for both server and client bundles via
// NEXT_PUBLIC_CORE_VERSION. lib/versions.ts uses it as the "latest" docs version
// so the version selector always tracks core. Falls back if the file is missing.
function coreVersion(): string {
  try {
    const pkgPath = path.resolve(import.meta.dirname, "..", "core", "package.json")
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string }
    if (pkg.version) return pkg.version
  } catch {
    // ignore — fall through to the fallback below
  }
  return "3.0.0"
}

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_CORE_VERSION: coreVersion(),
  },
  // This package sits inside the monorepo (and is also listed in the root
  // pnpm-workspace.yaml), so its node_modules/next is a symlink up into the
  // root's pnpm store. With two lockfiles present, Turbopack can't decide on a
  // workspace root and ends up resolving Next through two paths — the same
  // package as two module identities — which crashes the dev server with a
  // "module factory is not available" error on next/dist internals. Pin the
  // root to the monorepo root (where Next physically lives) so there is a single
  // resolution base.
  turbopack: {
    root: path.resolve(import.meta.dirname, "..", ".."),
  },
}

export default nextConfig
