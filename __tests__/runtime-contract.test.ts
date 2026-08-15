import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const expectedInstallCommand = 'cmds = ["PUPPETEER_SKIP_DOWNLOAD=true npm ci"]';

function expectExactInstallCommand(nixpacks: string): void {
  const headers = [...nixpacks.matchAll(/^\s*\[([^\]]+)]\s*(?:#.*)?$/gm)];
  const installHeaders = headers.filter((header) => header[1] === 'phases.install');

  expect(installHeaders).toHaveLength(1);

  const installHeader = installHeaders[0];
  const headerIndex = headers.indexOf(installHeader);
  const sectionStart = (installHeader.index ?? 0) + installHeader[0].length;
  const sectionEnd = headers[headerIndex + 1]?.index ?? nixpacks.length;
  const commandLines = nixpacks
    .slice(sectionStart, sectionEnd)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^cmds\s*=/.test(line));

  expect(commandLines).toEqual([expectedInstallCommand]);
}

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
    expectExactInstallCommand(nixpacks);
    expect(nixpacks).not.toMatch(/"nodejs_(?:1[0-9]|2[0-35-9])"/);
  });

  it('rejects a skip-download claim that exists only in a comment', () => {
    const spoofed = `[phases.install]\ncmds = ["npm ci"]\n# ${expectedInstallCommand}\n`;

    expect(() => expectExactInstallCommand(spoofed)).toThrow();
  });
});
