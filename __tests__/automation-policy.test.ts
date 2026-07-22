import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const workflowsDirectory = join(root, '.github', 'workflows');
const autoMergeWorkflow = join(workflowsDirectory, 'dependabot-auto-merge.yml');
const ciWorkflow = join(workflowsDirectory, 'ci.yml');
const prLintWorkflow = join(workflowsDirectory, 'pr-lint.yml');
const dependabotConfig = join(root, '.github', 'dependabot.yml');
const packageManifest = join(root, 'package.json');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function trackedWorkflowFiles(): string[] {
  return execFileSync('git', ['ls-files', '.github/workflows'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((path) => join(root, path))
    .filter(existsSync);
}

function externalGitHubActionReferences(contents: string): string[] {
  return Array.from(
    contents.matchAll(/^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:\s+#.*)?$/gm),
    ([, doubleQuoted, singleQuoted, bare]) => doubleQuoted ?? singleQuoted ?? bare
  ).filter((reference) => !reference.startsWith('./') && !reference.startsWith('docker://'));
}

function expectExternalGitHubActionsPinned(contents: string): void {
  for (const reference of externalGitHubActionReferences(contents)) {
    const separator = reference.lastIndexOf('@');

    expect(separator).toBeGreaterThan(0);
    expect(reference.slice(separator + 1)).toMatch(/^[0-9a-f]{40}$/);
  }
}

describe('repository automation policy', () => {
  it('rejects unpinned list-step actions and accepts SHA-pinned equivalents', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';

    expect(() => expectExternalGitHubActionsPinned('- uses: example/action@v1')).toThrow();
    expect(() => expectExternalGitHubActionsPinned(`- uses: example/action@${sha}`)).not.toThrow();
  });

  it('does not require SHAs for local actions', () => {
    expect(() => expectExternalGitHubActionsPinned('- uses: ./path/to/action')).not.toThrow();
  });

  it('removes the legacy Dependabot auto-merge workflow', () => {
    expect(existsSync(autoMergeWorkflow)).toBe(false);
  });

  it('keeps every tracked workflow read-only and pins every external action by SHA', () => {
    for (const workflow of trackedWorkflowFiles()) {
      const contents = read(workflow);

      expect(contents).not.toMatch(/gh\s+pr\s+merge\s+--auto/);
      expect(contents).not.toMatch(/^\s*(?:pull-requests|contents):\s*write\s*$/m);
      expect(contents).not.toMatch(/@latest\b/);

      expectExternalGitHubActionsPinned(contents);
    }
  });

  it('uses least privilege and immutable actions in CI without changing check names', () => {
    const contents = read(ciWorkflow);

    expect(contents).toMatch(/^permissions:\n\s+contents:\s+read\s*$/m);
    expect(contents).toContain('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6');
    expect(contents).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7');
    expect(contents).toMatch(/lint-and-test:[\s\S]*node-version: \[20, 22\]/);
    expect(contents).toMatch(/^\s{2}claudelint:\s*$/m);
    expect(contents).toMatch(/claudelint:[\s\S]*run: npm ci/);
    expect(contents).toMatch(/claudelint:[\s\S]*run: npm run test:automation-policy/);
    expect(contents).toMatch(
      /claudelint:[\s\S]*\.\/node_modules\/\.bin\/claudelint check-all --format github --no-cache/
    );
    expect(contents).not.toMatch(/npx\s+claude-code-lint/);
  });

  it('pins the PR title action immutably while retaining its read-only permission', () => {
    const contents = read(prLintWorkflow);

    expect(contents).toMatch(/^permissions:\n\s+pull-requests:\s+read\s*$/m);
    expect(contents).toContain(
      'amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50 # v6'
    );
  });

  it('stages Dependabot updates at the required local schedule and limits', () => {
    const contents = read(dependabotConfig);

    expect(contents).toMatch(
      /package-ecosystem: 'npm'[\s\S]*?day: 'wednesday'[\s\S]*?time: '06:00'[\s\S]*?timezone: 'America\/Los_Angeles'[\s\S]*?open-pull-requests-limit: 2/
    );
    expect(contents).toMatch(
      /package-ecosystem: 'github-actions'[\s\S]*?day: 'wednesday'[\s\S]*?time: '06:30'[\s\S]*?timezone: 'America\/Los_Angeles'[\s\S]*?open-pull-requests-limit: 1/
    );
  });

  it('uses the exact local Claude Code lint dependency', () => {
    const manifest = JSON.parse(read(packageManifest)) as {
      devDependencies?: Record<string, string>;
    };

    expect(manifest.devDependencies?.['claude-code-lint']).toBe('0.7.0');
  });
});
