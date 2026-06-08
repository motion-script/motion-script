import fs from 'node:fs';
import path from 'node:path';

const corePkgPath = path.resolve('packages/core/package.json');
const { version } = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));

const changesetConfig = JSON.parse(fs.readFileSync(path.resolve('.changeset/config.json'), 'utf8'));
const fixedPackages = changesetConfig.fixed.flat();

function* findPackageJsons(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const sub = path.join(dir, entry.name);
    const pkgPath = path.join(sub, 'package.json');
    if (fs.existsSync(pkgPath)) {
      yield pkgPath;
    } else {
      yield* findPackageJsons(sub); // recurse into nested dirs, e.g. packages/components/*
    }
  }
}

for (const pkgPath of findPackageJsons(path.resolve('packages'))) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!fixedPackages.includes(pkg.name)) continue;

  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Synced ${pkg.name} to v${version}`);
}
