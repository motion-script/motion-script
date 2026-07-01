# Versioned docs

Older documentation versions live here, one folder per version, named
`version-<id>` (e.g. `version-1.0.0`). The **latest** version is _not_ here — it
is the live `content/docs/` tree and is served without a version prefix.

URLs:

- latest: `/docs/<slug>` (from `content/docs/`)
- older:  `/docs/<id>/<slug>` (from `content/versioned_docs/version-<id>/`)

The version list and which one is "latest" are declared in
[`lib/versions.ts`](../../lib/versions.ts) — that file is the single source of
truth, this directory just holds the content.

## Cutting a new version

When you ship a release and want the current docs frozen as an older version:

1. Copy the current latest into snapshot folders:
   - prose docs: `cp -R content/docs content/versioned_docs/version-<old-id>`
   - API docs: `cp -R ../old-site/api content/versioned_api/version-<old-id>`
2. Add the old id to `VERSIONS` in `lib/versions.ts` (with `latest: false`),
   and bump the latest entry's `version`/`label` to the new release. If the old
   version ships a different package set, add an entry for it in
   `PACKAGES_BY_VERSION` in `lib/api.ts` (otherwise the default list is used).
3. Keep editing `content/docs/` (and regenerating `../old-site/api`) for the new
   latest version.

No route changes are needed — `generateStaticParams` walks every version in
`VERSIONS` automatically, for both `/docs` and `/api`.

## API versions

The same scheme applies to the API reference:

- latest: `/api/<pkg>/...` (sourced from `../old-site/api`)
- older:  `/api/<id>/<pkg>/...` (from `content/versioned_api/version-<id>/`)

Older API snapshots live in `content/versioned_api/version-<id>/`, mirroring the
generated typedoc layout (`<pkg>/typedoc-sidebar.cjs` plus the `.md` tree).
