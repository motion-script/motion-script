import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';
import { modify, applyEdits } from 'jsonc-parser';
import type minimist from 'minimist';
import {
    componentsConfigExists,
    defaultComponentsConfig,
    writeComponentsConfig,
    DEFAULT_COMPONENTS_ALIAS,
    DEFAULT_COMPONENTS_PATH,
    COMPONENTS_CONFIG_FILENAME,
} from './config.js';
import type { ComponentsConfig } from './schema.js';

/**
 * `ms init` — write `components.json` and wire a "@/components/*" path alias
 * into tsconfig.json so the editor/typechecker resolves it. Vite's own
 * resolution comes from `@motion-script/vite-plugin` reading components.json
 * directly (see the plugin's `config()` hook), not from tsconfig — this edit
 * is purely for TypeScript/IDE intellisense.
 *
 * Deliberately diverges from shadcn's own `init` (which *requires* an
 * existing tsconfig path alias and errors if one is missing): motion-script's
 * scaffolded templates don't ship one the way Next.js/Vite+React starters do
 * for shadcn, so requiring it here would break every fresh project's first
 * `ms add`. Uses jsonc-parser so existing comments/formatting in a
 * hand-edited tsconfig.json survive, unlike a JSON.parse/stringify round-trip.
 */
export async function runInit(projectRoot: string, argv: minimist.ParsedArgs): Promise<ComponentsConfig> {
    if (componentsConfigExists(projectRoot) && !argv.force) {
        console.log(kleur.yellow(`${COMPONENTS_CONFIG_FILENAME} already exists. Pass --force to overwrite.`));
        return JSON.parse(
            fs.readFileSync(path.join(projectRoot, COMPONENTS_CONFIG_FILENAME), 'utf8'),
        ) as ComponentsConfig;
    }

    const nonInteractive = Boolean(argv.yes);
    const answers = nonInteractive
        ? { componentsPath: DEFAULT_COMPONENTS_PATH, alias: DEFAULT_COMPONENTS_ALIAS }
        : await prompts([
            {
                type: 'text',
                name: 'componentsPath',
                message: 'Where should added component source live?',
                initial: DEFAULT_COMPONENTS_PATH,
            },
            {
                type: 'text',
                name: 'alias',
                message: 'Import alias for components',
                initial: DEFAULT_COMPONENTS_ALIAS,
            },
        ]);

    if (!nonInteractive && answers.componentsPath === undefined) {
        throw new Error('Aborted.');
    }

    const config = defaultComponentsConfig();
    config.paths.components = answers.componentsPath;
    config.aliases.components = answers.alias;

    writeComponentsConfig(projectRoot, config);
    console.log(kleur.green(`✓ Wrote ${COMPONENTS_CONFIG_FILENAME}`));

    addTsconfigAlias(projectRoot, config.aliases.components, config.paths.components);

    return config;
}

/** Add `"<alias>/*": ["./<dir>/*"]` under compilerOptions.paths, preserving comments/formatting. */
function addTsconfigAlias(projectRoot: string, alias: string, componentsDir: string): void {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
        console.log(kleur.yellow('No tsconfig.json found — skipping path alias setup.'));
        return;
    }

    const original = fs.readFileSync(tsconfigPath, 'utf8');
    const aliasKey = `${alias}/*`;
    const aliasValue = [`./${componentsDir.replace(/\\/g, '/')}/*`];

    const edits = modify(original, ['compilerOptions', 'paths', aliasKey], aliasValue, {
        formattingOptions: { insertSpaces: true, tabSize: 4 },
    });
    if (edits.length === 0) return;

    fs.writeFileSync(tsconfigPath, applyEdits(original, edits));
    console.log(kleur.green(`✓ Added "${aliasKey}" to tsconfig.json`));
}
