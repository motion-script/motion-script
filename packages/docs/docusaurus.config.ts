import * as path from 'path';
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Root of the dedicated API docs-content instance (see the `api` plugin below).
// docusaurus-plugin-typedoc computes each generated sidebar's doc-id prefix as
// the path of its `out` dir relative to `docsPath`; pointing docsPath here makes
// those ids `core/...`, `code/...`, `latex/...` (relative to the api/ root)
// rather than the default `../api/...` (which assumes output under docs/).
const apiDocsPath = path.join(__dirname, 'api');

const config: Config = {
  title: 'MotionScript',
  tagline: 'Dinosaurs are cool',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://motionscript.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    function tailwindPlugin() {
      return {
        name: 'tailwind-plugin',
        configurePostCss(postcssOptions: { plugins: unknown[] }) {
          postcssOptions.plugins.push(require('@tailwindcss/postcss'));
          return postcssOptions;
        },
      };
    },
    // The /editor page embeds the player in an iframe. CanvasKit decodes
    // media in a worker that uses SharedArrayBuffer, which requires the page
    // to be cross-origin isolated. We set COOP + COEP on the dev server so
    // both the embedder page and the embedded /player/ document qualify.
    // COEP is `credentialless` (not `require-corp`) so the rest of the docs
    // site's cross-origin assets keep loading without needing CORP headers.
    //
    // NOTE: the production host must send the same headers (e.g. a GitHub
    // Pages `_headers`/CDN rule, or a Netlify/Cloudflare config) — otherwise
    // the deployed editor won't be cross-origin isolated.
    function crossOriginIsolationPlugin() {
      return {
        name: 'cross-origin-isolation-plugin',
        configureWebpack() {
          return {
            devServer: {
              headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'credentialless',
              },
            },
          };
        },
      };
    },
    // One docusaurus-plugin-typedoc instance per documented package. Each emits
    // Markdown into api/<pkg> (a sibling of docs/, owned by the dedicated `api`
    // docs-content instance below — NOT mixed into the main docs sidebar).
    // `sanitizeComments` escapes angle brackets/braces in JSDoc text so the
    // generated Markdown (generics like `<T>`, `{1}`, unions, ...) parses as MDX.
    //
    // The reference is organized BY FEATURE, not by TypeDoc kind. Instead of a
    // single `index.ts` barrel (which would collapse everything into one module
    // grouped into Classes/Interfaces/Functions/…), each package lists one entry
    // point per feature folder, with `entryPointStrategy: 'resolve'`. TypeDoc
    // then emits one module per entry point, named after the folder, so the
    // sidebar's top level is the feature set (nodes, attributes, tween, …).
    // `navigation.includeGroups: false` (a typedoc-plugin-markdown option)
    // flattens each feature: members are listed directly under it rather than
    // re-split into per-kind sub-categories.
    //
    // `code`/`latex` are flat single-feature packages, so they keep the barrel.
    ...[
      {
        id: 'core',
        // One entry per feature folder under core/src (each has an index.ts
        // barrel except jsx, which exposes its runtime directly). Keep this in
        // sync with core/src/index.ts when feature folders are added/removed.
        entryPoints: [
          '../core/src/assets/index.ts',
          '../core/src/attributes/index.ts',
          '../core/src/jsx/jsx-runtime.ts',
          '../core/src/layout/index.ts',
          '../core/src/nodes/index.ts',
          '../core/src/platform/index.ts',
          '../core/src/project/index.ts',
          '../core/src/render/index.ts',
          '../core/src/runtime/index.ts',
          '../core/src/signals/index.ts',
          '../core/src/tween/index.ts',
          '../core/src/util/index.ts',
        ],
        tsconfig: '../core/tsconfig.json',
      },
      { id: 'code', entryPoints: ['../components/code/src/index.ts'], tsconfig: '../components/code/tsconfig.json' },
      { id: 'latex', entryPoints: ['../components/latex/src/index.ts'], tsconfig: '../components/latex/tsconfig.json' },
    ].map((pkg) => [
      'docusaurus-plugin-typedoc',
      {
        id: pkg.id,
        entryPoints: pkg.entryPoints,
        // 'resolve' treats each entry point as its own module/page; combined
        // with the per-feature entry list above this yields one module per
        // feature folder. (The default 'resolve' on a single barrel would
        // instead produce one flat module.)
        entryPointStrategy: 'resolve',
        tsconfig: pkg.tsconfig,
        out: `api/${pkg.id}`,
        docsPath: apiDocsPath,
        readme: 'none',
        excludeExternals: true,
        excludePrivate: true,
        excludeProtected: true,
        sanitizeComments: true,
        // Flatten each feature: list its members directly, not re-grouped into
        // Classes/Interfaces/Functions/… sub-categories in the sidebar.
        navigation: {
          includeGroups: false,
          includeCategories: false,
        },
      },
    ]),

    // Dedicated docs-content instance for the generated API reference. Serves
    // api/** at /api with its own sidebar (see sidebars.ts -> apiSidebar), so
    // the reference stays out of the main Docs section.
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: 'api',
        routeBasePath: 'api',
        sidebarPath: './sidebarsApi.ts',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: ['./src/css/fonts.css', './src/css/custom.css'],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      // The brand text is rendered as two-tone "Motion Script" (thin serif +
      // pixelify) entirely via CSS in custom.css, to match the landing-page
      // Navbar. Keep the title here as the accessible/SSR label.
      title: 'Motion Script',
      logo: {
        alt: 'MotionScript Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          // Dedicated API docs-content instance (served at /api). `docSidebar`
          // makes the navbar item active across all /api/** pages.
          type: 'docSidebar',
          docsPluginId: 'api',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API',
        },
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          href: 'https://github.com/motion-script/motion-script',
          // `navbar__github-link` is styled in custom.css to match the landing
          // page: an octocat icon + "GitHub" label inside a rounded pill.
          className: 'navbar__github-link',
          'aria-label': 'GitHub repository',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Tutorial',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'https://discord.gg/EedNxs4WUZ',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/motion-script/motion-script',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MotionScript. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
