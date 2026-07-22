import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

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
    .filter((path) => /\.ya?ml$/.test(path))
    .map((path) => join(root, path))
    .filter(existsSync);
}

function validateActionReference(reference: string): void {
  if (reference.startsWith('./') || reference.startsWith('docker://')) return;

  const separator = reference.lastIndexOf('@');
  const revision = reference.slice(separator + 1);

  if (separator <= 0 || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`External action must use a full commit SHA: ${reference}`);
  }
}

function validateWorkflowValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) validateWorkflowValue(item);
    return;
  }

  if (typeof value !== 'object' || value === null) return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'uses') {
      if (typeof child !== 'string') throw new Error('Workflow uses values must be strings');
      validateActionReference(child);
    }

    if ((key === 'contents' || key === 'pull-requests') && child === 'write') {
      throw new Error(`Workflow permission ${key} must not be write`);
    }

    validateWorkflowValue(child);
  }
}

function validateWorkflowAutomationPolicy(contents: string): void {
  const workflow = parse(contents) as unknown;
  validateWorkflowValue(workflow);
}

describe('repository automation policy', () => {
  it.each([
    [
      'flow-style unpinned actions',
      'jobs:\n  build:\n    steps:\n      - { uses: example/action@v1 }',
    ],
    ['spaced uses keys', 'jobs:\n  build:\n    steps:\n      - uses : example/action@v1'],
    ['flow-style write permissions', 'jobs:\n  build:\n    permissions: { contents: write }'],
  ])('rejects %s', (_description, contents) => {
    expect(() => validateWorkflowAutomationPolicy(contents)).toThrow();
  });

  it('fails closed when workflow YAML is invalid', () => {
    const contents = 'jobs:\n  build: [';

    expect(() => validateWorkflowAutomationPolicy(contents)).toThrow();
  });

  it('rejects unpinned list-step actions and accepts SHA-pinned equivalents', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';

    expect(() => validateWorkflowAutomationPolicy('- uses: example/action@v1')).toThrow();
    expect(() => validateWorkflowAutomationPolicy(`- uses: example/action@${sha}`)).not.toThrow();
  });

  it.each(['./path/to/action', 'docker://alpine:3.22'])(
    'allows non-GitHub action reference %s',
    (reference) => {
      expect(() => validateWorkflowAutomationPolicy(`- uses: ${reference}`)).not.toThrow();
    }
  );

  it('removes the legacy Dependabot auto-merge workflow', () => {
    expect(existsSync(autoMergeWorkflow)).toBe(false);
  });

  it('keeps every tracked workflow read-only and pins every external action by SHA', () => {
    for (const workflow of trackedWorkflowFiles()) {
      const contents = read(workflow);

      expect(contents).not.toMatch(/gh\s+pr\s+merge\s+--auto/);
      expect(contents).not.toMatch(/@latest\b/);

      validateWorkflowAutomationPolicy(contents);
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

  it('uses exact direct dependencies for repository policy tooling', () => {
    const manifest = JSON.parse(read(packageManifest)) as {
      devDependencies?: Record<string, string>;
    };

    expect(manifest.devDependencies?.['claude-code-lint']).toBe('0.7.0');
    expect(manifest.devDependencies?.yaml).toBe('2.8.2');
  });
});
