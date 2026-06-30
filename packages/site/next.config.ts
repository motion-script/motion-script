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
  // The /editor page embeds the player in an iframe. CanvasKit decodes media in
  // a worker that uses SharedArrayBuffer, which requires the page to be
  // cross-origin isolated. We send COOP + COEP so both the embedder page and the
  // embedded /player/ document qualify. COEP is `credentialless` (not
  // `require-corp`) so the rest of the site's cross-origin assets keep loading
  // without needing CORP headers.
  //
  // NOTE: `output: "export"` produces a static bundle and Next.js does NOT apply
  // this `headers()` config to the exported files — it only takes effect under
  // `next dev`. Production (Vercel) sends the same headers via vercel.json; any
  // other host MUST mirror them, or the deployed editor won't be cross-origin
  // isolated. Scope matches vercel.json: only /editor and /player/* (not
  // site-wide, so `credentialless` can't affect other pages' cross-origin loads).
  async headers() {
    const coiHeaders = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ]
    return [
      { source: "/editor", headers: coiHeaders },
      { source: "/player/:path*", headers: coiHeaders },
    ]
  },
}

export default nextConfig
