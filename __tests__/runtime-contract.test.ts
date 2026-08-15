import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('deployment runtime contract', () => {
  it('keeps the local, package, and Nixpacks Node majors aligned on 24', () => {
    const nvmVersion = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
    const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };
    const nixpacks = readFileSync(join(root, 'nixpacks.toml'), 'utf8');

    expect(nvmVersion).toMatch(/^24\./);
    expect(packageManifest.engines?.node).toBe('>=24.19.0 <25');
    expect(nixpacks).toContain('"nodejs_24"');
    expect(nixpacks).toContain('nixpkgsArchive = "9259541b1652dae633707ff840858fd397df66bc"');
    expect(nixpacks).not.toMatch(/"nodejs_(?:1[0-9]|2[0-35-9])"/);
  });
});
