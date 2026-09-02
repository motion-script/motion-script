# Visual e2e harness for Motion Script.
#
# Renders every scene in packages/e2e against both the live workspace build
# ("lib") and the packed stable build ("stable"), screenshots first/mid/last of
# each, and pixel-diffs the two — producing out/report.html.
#
# The base image is Playwright's, and it is kept for exactly one thing now: a
# fixed set of fonts. Nothing here launches a browser any more — the harness
# renders in process through @motion-script/engine on CanvasKit's CPU rasterizer
# — but the font set is what makes text reproducible run-to-run, which is the
# whole point of comparing in a container rather than on a dev's machine.
#
# Build context is the REPO ROOT (so the whole workspace is available to build
# and pack), not packages/e2e:
#   docker build -f packages/e2e/Dockerfile -t motion-script-e2e .
#   docker run --rm -v "$PWD/packages/e2e/out:/repo/packages/e2e/out" motion-script-e2e
#
# Or via compose (see packages/e2e/docker-compose.yml):
#   docker compose -f packages/e2e/docker-compose.yml run --rm e2e
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /repo

# Nothing downloads or launches a browser; the rasterizer is CPU-only and needs
# no GPU, no display and no driver.
ENV CI=1

# Corepack ships with Node; pin pnpm to the repo's packageManager field.
RUN corepack enable

# --- Dependency layer (cached unless any manifest/lockfile changes) ----------
# Copy the root files dependency resolution and the package builds need. The
# package tsconfigs all extend ../../tsconfig.base.json, so it must be present
# or every `tsc` build fails with TS5083.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
# Workspace package sources + manifests (globbed copy preserves packages/* layout).
COPY packages/ ./packages/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile

# --- Build + run -------------------------------------------------------------
# Build every publishable package, then run the full pipeline. The entrypoint
# script (a) builds the stable snapshot from packed tarballs and (b) renders +
# compares both variants. Splitting build from run keeps the build cached.
RUN pnpm build:lib

# The whole thing — pack stable tarballs, render both variants, compare —
# lives in one script so `docker run` is a single self-contained invocation.
ENTRYPOINT ["pnpm", "run", "e2e:ci"]
