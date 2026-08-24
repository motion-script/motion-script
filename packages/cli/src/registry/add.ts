import path from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';
import type minimist from 'minimist';
import { componentsConfigExists, loadComponentsConfig } from './config.js';
import { fetchRegistryIndex } from './fetch.js';
import { resolveComponents, writeComponentFiles, collectDependencies } from './install.js';
import { detectPackageManager, installDependencies } from './package-manager.js';
import { runInit } from './init.js';

/**
 * `ms add [name...]` — copy one or more registry components' source into
 * this project, following any `registryDependencies` first, then install the
 * npm packages they need.
 */
export async function runAdd(projectRoot: string, argv: minimist.ParsedArgs): Promise<void> {
    if (!componentsConfigExists(projectRoot)) {
        if (!argv.yes) {
            const { proceed } = await prompts({
                type: 'confirm',
                name: 'proceed',
                message: 'No components.json found. Run `ms init` now?',
                initial: true,
            });
            if (!proceed) {
                console.log(kleur.dim('Aborted.'));
                return;
            }
        }
        await runInit(projectRoot, argv);
    }

    const config = loadComponentsConfig(projectRoot);
    if (!config) throw new Error('components.json could not be loaded after init.');

    const defaultRegistryUrl = typeof argv.registry === 'string' ? argv.registry : undefined;

    let names = (argv._.slice(1) as string[]).filter(Boolean);
    if (names.length === 0) {
        const index = await fetchRegistryIndex(defaultRegistryUrl);
        if (index.length === 0) {
            console.log(kleur.yellow('The registry has no components to add.'));
            return;
        }
        const { selected } = await prompts({
            type: 'multiselect',
            name: 'selected',
            message: 'Select components to add',
            choices: index.map(entry => ({
                title: entry.name,
                description: entry.description,
                value: entry.name,
            })),
            min: 1,
        });
        if (!selected || (selected as string[]).length === 0) {
            console.log(kleur.dim('Aborted.'));
            return;
        }
        names = selected as string[];
    }

    console.log(kleur.bold(`Adding ${names.join(', ')}...`));
    const items = await resolveComponents(names, config, defaultRegistryUrl);

    for (const item of items) {
        const { written, skipped } = await writeComponentFiles(item, config, projectRoot, {
            // --yes is "fully non-interactive": it also answers the overwrite
            // prompt, so a scripted `ms add --yes` never blocks on stdin.
            force: Boolean(argv.overwrite || argv.yes),
        });
        for (const file of written) {
            console.log(`  ${kleur.green('✓')} ${path.relative(projectRoot, file)}`);
        }
        for (const file of skipped) {
            console.log(`  ${kleur.dim('–')} ${path.relative(projectRoot, file)} ${kleur.dim('(skipped)')}`);
        }
    }

    if (!argv['skip-install']) {
        const dependencies = collectDependencies(items);
        if (Object.keys(dependencies).length > 0) {
            const pm = detectPackageManager(projectRoot);
            console.log(kleur.bold(`Installing dependencies with ${pm}...`));
            installDependencies(pm, dependencies, projectRoot);
        }
    }

    console.log(kleur.green(`Done. Added: ${items.map(i => i.name).join(', ')}.`));
}
