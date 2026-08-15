import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const root = join(__dirname, '..');
const workflowsDirectory = join(root, '.github', 'workflows');
const autoMergeWorkflow = join(workflowsDirectory, 'dependabot-auto-merge.yml');
const autoMergePilotWorkflow = join(workflowsDirectory, 'dependabot-automerge-pilot.yml');
const circuitBreakerWorkflow = join(workflowsDirectory, 'dependabot-automerge-circuit-breaker.yml');
const ciWorkflow = join(workflowsDirectory, 'ci.yml');
const prLintWorkflow = join(workflowsDirectory, 'pr-lint.yml');
const dependabotConfig = join(root, '.github', 'dependabot.yml');
const renovateConfig = join(root, 'renovate.json');
const packageManifest = join(root, 'package.json');

type Workflow = {
  on?: {
    pull_request_target?: {
      types?: string[];
    };
    repository_dispatch?: {
      types?: string[];
    };
  };
  permissions?: Record<string, string>;
  concurrency?: {
    group?: string;
    'cancel-in-progress'?: boolean;
  };
  jobs?: Record<
    string,
    {
      if?: string;
      needs?: string[];
      permissions?: Record<string, string>;
      strategy?: {
        matrix?: {
          'node-version'?: number[];
        };
      };
      steps?: Array<{
        id?: string;
        name?: string;
        if?: string;
        'continue-on-error'?: boolean;
        env?: Record<string, string>;
        uses?: string;
        run?: string;
        with?: Record<string, unknown>;
      }>;
    }
  >;
};

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

function validateWorkflowValue(
  value: unknown,
  allowWritePermissions = false,
  inPermissions = false
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      validateWorkflowValue(item, allowWritePermissions, inPermissions);
    }
    return;
  }

  if (typeof value !== 'object' || value === null) return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'uses') {
      if (typeof child !== 'string') throw new Error('Workflow uses values must be strings');
      validateActionReference(child);
    }

    if (key === 'permissions' && child === 'write-all') {
      throw new Error('Workflow permissions must not be write-all');
    }

    if (
      !allowWritePermissions &&
      child === 'write' &&
      (inPermissions || key === 'contents' || key === 'pull-requests')
    ) {
      throw new Error(`Workflow permission ${key} must not be write`);
    }

    validateWorkflowValue(child, allowWritePermissions, inPermissions || key === 'permissions');
  }
}

function validateWorkflowAutomationPolicy(contents: string): void {
  const workflow = parse(contents) as Workflow;
  validateWorkflowValue(workflow);
}

function hasWritePermission(value: unknown, inPermissions = false): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasWritePermission(item, inPermissions));
  }
  if (typeof value !== 'object' || value === null) return false;

  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      (key === 'permissions' && child === 'write-all') ||
      (inPermissions && child === 'write') ||
      hasWritePermission(child, inPermissions || key === 'permissions')
  );
}

const exactSemverPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function validateExactSemver(version: unknown): void {
  if (typeof version !== 'string' || !exactSemverPattern.test(version)) {
    throw new Error(`Policy tooling must use an exact semantic version: ${String(version)}`);
  }
}

type RenovateRule = {
  description?: string;
  matchManagers?: string[];
  matchDepTypes?: string[];
  matchCurrentVersion?: string;
  matchUpdateTypes?: string[];
  matchPackageNames?: string[];
  groupName?: string;
  minimumReleaseAge?: string;
  dependencyDashboardApproval?: boolean;
  automerge?: boolean;
};

type RenovateConfig = {
  enabled?: boolean;
  enabledManagers?: string[];
  platformAutomerge?: boolean;
  automergeType?: string;
  automergeStrategy?: string;
  internalChecksFilter?: string;
  minimumReleaseAgeBehaviour?: string;
  prCreation?: string;
  ignoreUnstable?: boolean;
  vulnerabilityAlerts?: { enabled?: boolean };
  lockFileMaintenance?: {
    enabled?: boolean;
    dependencyDashboardApproval?: boolean;
    automerge?: boolean;
  };
  packageRules?: RenovateRule[];
};

const unsafeUpdateTypes = ['digest', 'pin', 'pinDigest', 'lockFileMaintenance'];

function expectActiveRenovateOwnershipPolicy(config: RenovateConfig): void {
  expect(config.enabled).toBe(true);
  expect(config.enabledManagers).toEqual(['npm', 'github-actions']);
  expect(config.platformAutomerge).toBe(true);
  expect(config.automergeType).toBe('pr');
  expect(config.automergeStrategy).toBe('squash');
  expect(config.internalChecksFilter).toBe('strict');
  expect(config.minimumReleaseAgeBehaviour).toBe('timestamp-required');
  expect(config.prCreation).toBe('not-pending');
  expect(config.ignoreUnstable).toBe(true);
  expect(config.vulnerabilityAlerts).toEqual({ enabled: false });
  expect(config.lockFileMaintenance).toEqual({
    enabled: true,
    schedule: ['before 6am on monday'],
    dependencyDashboardApproval: true,
    automerge: false,
  });

  const rules = config.packageRules ?? [];
  expect(rules[0]).toEqual({
    description: 'Default every enabled manager to dashboard approval',
    matchManagers: ['npm', 'github-actions'],
    dependencyDashboardApproval: true,
    automerge: false,
  });
  const automergeRules = rules.filter((rule) => rule.automerge === true);
  expect(automergeRules).toEqual([
    {
      description: 'Stable npm runtime patches preserve the proven legacy envelope',
      matchManagers: ['npm'],
      matchDepTypes: ['dependencies', 'optionalDependencies'],
      matchCurrentVersion: '/^[1-9]\\d*\\.\\d+\\.\\d+$/',
      matchUpdateTypes: ['patch'],
      minimumReleaseAge: '7 days',
      dependencyDashboardApproval: false,
      automerge: true,
    },
    {
      description: 'Stable npm development non-major updates',
      matchManagers: ['npm'],
      matchDepTypes: ['devDependencies'],
      matchCurrentVersion: '/^[1-9]\\d*\\.\\d+\\.\\d+$/',
      matchUpdateTypes: ['patch', 'minor'],
      matchPackageNames: ['!claude-code-lint', '!prettier', '!yaml'],
      groupName: 'development dependencies',
      minimumReleaseAge: '7 days',
      dependencyDashboardApproval: false,
      automerge: true,
    },
  ]);

  for (const rule of automergeRules) {
    expect(
      rule.matchUpdateTypes?.every((updateType) => ['patch', 'minor'].includes(updateType))
    ).toBe(true);
  }

  const terminalGate = rules.at(-1);
  expect(terminalGate).toEqual({
    description: 'Pin, digest, and lockfile updates require exception handling',
    matchUpdateTypes: unsafeUpdateTypes,
    dependencyDashboardApproval: true,
    automerge: false,
  });

  for (const updateType of unsafeUpdateTypes) {
    expect(
      rules.some(
        (rule) =>
          rule.matchUpdateTypes?.includes(updateType) &&
          rule.dependencyDashboardApproval === true &&
          rule.automerge === false
      )
    ).toBe(true);
    expect(
      rules.some((rule) => rule.matchUpdateTypes?.includes(updateType) && rule.automerge === true)
    ).toBe(false);
  }
}

describe('repository automation policy', () => {
  it.each([
    [
      'flow-style unpinned actions',
      'jobs:\n  build:\n    steps:\n      - { uses: example/action@v1 }',
    ],
    ['spaced uses keys', 'jobs:\n  build:\n    steps:\n      - uses : example/action@v1'],
    ['flow-style write permissions', 'jobs:\n  build:\n    permissions: { contents: write }'],
    ['top-level write-all permissions', 'permissions: write-all\njobs: {}'],
    ['job-level write-all permissions', 'jobs:\n  build:\n    permissions: write-all'],
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

      expect(contents).not.toMatch(/gh\s+pr\s+merge/);
      expect(contents).not.toMatch(/@latest\b/);
      validateWorkflowAutomationPolicy(contents);
    }
  });

  it('retires every Dependabot-side merge path and write-enabled canary', () => {
    expect(existsSync(autoMergeWorkflow)).toBe(false);
    expect(existsSync(autoMergePilotWorkflow)).toBe(false);
    expect(existsSync(circuitBreakerWorkflow)).toBe(false);
    expect(trackedWorkflowFiles().some((path) => hasWritePermission(parse(read(path))))).toBe(
      false
    );
  });
  it('uses least privilege and immutable actions in CI without changing check names', () => {
    const contents = read(ciWorkflow);

    expect(contents).toMatch(/^permissions:\n\s+contents:\s+read\s*$/m);
    expect(contents.match(/actions\/checkout@[^\r\n]+/g)).toEqual([
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    ]);
    expect(contents).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7');
    expect(contents).toMatch(/lint-and-test:[\s\S]*node-version: \[24\]/);
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

  it('keeps Dependabot security-only while Renovate owns routine versions', () => {
    const config = parse(read(dependabotConfig)) as {
      updates?: Array<Record<string, unknown>>;
    };
    const updates = config.updates ?? [];

    expect(updates.map((update) => update['package-ecosystem'])).toEqual(['npm', 'github-actions']);
    expect(updates.every((update) => update['open-pull-requests-limit'] === 0)).toBe(true);
    expect(updates.map((update) => update.directory)).toEqual(['/', '/']);
    expect(updates.every((update) => update.ignore === undefined)).toBe(true);
  });

  it('isolates Prettier updates from the general development dependency group', () => {
    const config = parse(read(dependabotConfig)) as {
      updates?: Array<{
        'package-ecosystem'?: string;
        groups?: Record<
          string,
          {
            'dependency-type'?: string;
            patterns?: string[];
            'exclude-patterns'?: string[];
            'update-types'?: string[];
          }
        >;
      }>;
    };
    const npmGroups = config.updates?.find(
      (update) => update['package-ecosystem'] === 'npm'
    )?.groups;

    expect(npmGroups?.prettier).toEqual({
      'dependency-type': 'development',
      patterns: ['prettier'],
      'update-types': ['minor', 'patch'],
    });
    expect(npmGroups?.['dev-dependencies']?.['exclude-patterns']).toEqual(['prettier']);
    expect(Object.keys(npmGroups ?? {}).indexOf('prettier')).toBeLessThan(
      Object.keys(npmGroups ?? {}).indexOf('dev-dependencies')
    );
  });

  it('activates only the proven Renovate ownership envelope', () => {
    const config = JSON.parse(read(renovateConfig)) as RenovateConfig;
    expectActiveRenovateOwnershipPolicy(config);
  });

  it('rejects unsafe Renovate enrollment, narrowed gates, and shortened quarantine', () => {
    const baseline = JSON.parse(read(renovateConfig)) as RenovateConfig;

    for (const unsafeUpdateType of unsafeUpdateTypes) {
      const unsafe = structuredClone(baseline);
      unsafe.packageRules?.push({
        matchUpdateTypes: [unsafeUpdateType],
        minimumReleaseAge: '7 days',
        dependencyDashboardApproval: false,
        automerge: true,
      });
      expect(() => expectActiveRenovateOwnershipPolicy(unsafe)).toThrow();
    }

    const narrowedGate = structuredClone(baseline);
    const gate = narrowedGate.packageRules?.at(-1);
    if (gate) gate.matchManagers = ['npm'];
    expect(() => expectActiveRenovateOwnershipPolicy(narrowedGate)).toThrow();

    const missingDefaultGate = structuredClone(baseline);
    missingDefaultGate.packageRules?.shift();
    expect(() => expectActiveRenovateOwnershipPolicy(missingDefaultGate)).toThrow();

    const shortenedAge = structuredClone(baseline);
    const runtime = shortenedAge.packageRules?.find((rule) => rule.automerge === true);
    if (runtime) runtime.minimumReleaseAge = '1 day';
    expect(() => expectActiveRenovateOwnershipPolicy(shortenedAge)).toThrow();

    const unstable = structuredClone(baseline);
    unstable.ignoreUnstable = false;
    expect(() => expectActiveRenovateOwnershipPolicy(unstable)).toThrow();
  });

  it.each(['2.8.2', '2.9.0', '3.0.0-rc.1', '2.9.0+policy.1'])(
    'accepts exact policy-tool version %s',
    (version) => {
      expect(() => validateExactSemver(version)).not.toThrow();
    }
  );

  it.each([
    '^2.8.2',
    '~2.8.2',
    'latest',
    'next',
    'v2.8.2',
    '2.8',
    '2.8.x',
    '01.2.3',
    '2.08.3',
    '2.8.03',
    '2.8.2-01',
    '',
  ])('rejects non-exact or malformed policy-tool version %s', (version) => {
    expect(() => validateExactSemver(version)).toThrow(
      'Policy tooling must use an exact semantic version'
    );
  });

  it('uses exact direct dependencies for repository policy tooling', () => {
    const manifest = JSON.parse(read(packageManifest)) as {
      devDependencies?: Record<string, string>;
    };

    expect(manifest.devDependencies?.['claude-code-lint']).toBe('0.7.0');
    expect(() => validateExactSemver(manifest.devDependencies?.yaml)).not.toThrow();
    expect(() => validateExactSemver(manifest.devDependencies?.prettier)).not.toThrow();
  });
});
