import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Minimal shape of the items in a typedoc-sidebar.cjs: either a leaf `doc`
// entry or a `category` that nests more items. Enough to flatten kind groups
// below without depending on a deep internal Docusaurus type path.
type ApiSidebarItem =
  | {type: 'doc'; id: string; label: string}
  | {type: 'category'; label: string; items: ApiSidebarItem[]; link?: unknown};

// Sidebar for the dedicated API docs-content instance (served at /api, see
// docusaurus.config.ts). One section per package, each populated from the
// typedoc-sidebar.cjs that `docusaurus-plugin-typedoc` regenerates into
// api/<pkg> on every start/build. Re-run those (or `pnpm build`/`pnpm start`)
// after changing a package's public API to refresh these.
/* eslint-disable @typescript-eslint/no-var-requires */
const coreApiSidebar = require('./api/core/typedoc-sidebar.cjs');
const codeApiSidebar = require('./api/code/typedoc-sidebar.cjs');
const latexApiSidebar = require('./api/latex/typedoc-sidebar.cjs');
/* eslint-enable @typescript-eslint/no-var-requires */

// `core` is a multi-feature package: docusaurus.config.ts gives it one TypeDoc
// entry point per src feature folder, so its generated sidebar is already
// grouped by feature (nodes, attributes, tween, …) with members flattened
// inside each — used as-is.
//
// `code`/`latex` are single-folder packages with one entry point, so TypeDoc
// can only group their generated sidebar by kind (Classes/Interfaces/Functions)
// — the per-feature `navigation.includeGroups: false` doesn't apply to a
// single-module project. To keep the whole reference organized by feature
// (each of these IS one feature) rather than by type, flatten those kind
// categories here into a single alphabetical member list. Operating on the
// regenerated cjs output means this survives every rebuild.
function flattenByKind(items: ApiSidebarItem[]): ApiSidebarItem[] {
  const docs: ApiSidebarItem[] = [];
  const collect = (entries: ApiSidebarItem[]) => {
    for (const entry of entries) {
      if (entry.type === 'category') {
        // Kind categories (Classes/Interfaces/…) have no own page, just nest
        // their members — recurse so we end up with the leaf docs only.
        collect(entry.items);
      } else {
        docs.push(entry);
      }
    }
  };
  collect(items);
  return docs.sort((a, b) => a.label.localeCompare(b.label));
}

const sidebars: SidebarsConfig = {
  apiSidebar: [
    {
      type: 'category',
      label: '@motion-script/core',
      link: {type: 'doc', id: 'core/index'},
      items: coreApiSidebar,
    },
    {
      type: 'category',
      label: '@motion-script/code',
      link: {type: 'doc', id: 'code/index'},
      items: flattenByKind(codeApiSidebar),
    },
    {
      type: 'category',
      label: '@motion-script/latex',
      link: {type: 'doc', id: 'latex/index'},
      items: flattenByKind(latexApiSidebar),
    },
  ],
};

export default sidebars;
