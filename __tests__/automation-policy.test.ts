import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const root = join(__dirname, '..');
const workflowsDirectory = join(root, '.github', 'workflows');
const autoMergeWorkflow = join(workflowsDirectory, 'dependabot-auto-merge.yml');
const autoMergePilotWorkflow = join(workflowsDirectory, 'dependabot-automerge-pilot.yml');
const circuitBreakerWorkflow = join(workflowsDirectory, 'dependabot-automerge-circuit-breaker.yml');
const privilegedWorkflowFiles = new Set([autoMergePilotWorkflow, circuitBreakerWorkflow]);
const ciWorkflow = join(workflowsDirectory, 'ci.yml');
const prLintWorkflow = join(workflowsDirectory, 'pr-lint.yml');
const dependabotConfig = join(root, '.github', 'dependabot.yml');
const packageManifest = join(root, 'package.json');

type Workflow = {
  on?: {
    pull_request_target?: {
      types?: string[];
    };
    workflow_run?: {
      workflows?: string[];
      types?: string[];
      branches?: string[];
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
      permissions?: unknown;
      steps?: Array<{
        id?: string;
        name?: string;
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

function readWorkflow(path: string): Workflow {
  return parse(read(path)) as Workflow;
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

function validateWorkflowAutomationPolicy(contents: string, path?: string): void {
  const workflow = parse(contents) as unknown;
  const isPrivileged = path !== undefined && privilegedWorkflowFiles.has(path);

  if (isPrivileged && typeof workflow === 'object' && workflow !== null) {
    const jobs = (workflow as Record<string, unknown>).jobs;
    if (typeof jobs === 'object' && jobs !== null && !Array.isArray(jobs)) {
      for (const job of Object.values(jobs as Record<string, unknown>)) {
        if (
          typeof job === 'object' &&
          job !== null &&
          Object.prototype.hasOwnProperty.call(job, 'permissions')
        ) {
          throw new Error('Privileged workflow jobs must not override permissions');
        }
      }
    }
  }

  validateWorkflowValue(workflow, isPrivileged);
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

  it('keeps every ordinary tracked workflow read-only and pins every external action by SHA', () => {
    for (const workflow of trackedWorkflowFiles().filter(
      (path) => !privilegedWorkflowFiles.has(path)
    )) {
      const contents = read(workflow);

      expect(contents).not.toMatch(/gh\s+pr\s+merge\s+--auto/);
      expect(contents).not.toMatch(/@latest\b/);

      validateWorkflowAutomationPolicy(contents, workflow);
    }
  });

  it('limits write permissions to the two exact privileged workflow filenames', () => {
    const workflowFiles = Array.from(
      new Set([...trackedWorkflowFiles(), autoMergePilotWorkflow, circuitBreakerWorkflow])
    );
    const writeEnabledFiles = workflowFiles.filter((path) =>
      hasWritePermission(parse(read(path)) as unknown)
    );

    expect(writeEnabledFiles.sort()).toEqual(
      [autoMergePilotWorkflow, circuitBreakerWorkflow].sort()
    );

    for (const path of [autoMergePilotWorkflow, circuitBreakerWorkflow]) {
      const contents = read(path);
      const workflow = readWorkflow(path);

      expect(() => validateWorkflowAutomationPolicy(contents, path)).not.toThrow();
      expect(() => validateWorkflowAutomationPolicy(contents, `${path}.renamed`)).toThrow(
        'Workflow permission'
      );
      expect(Object.values(workflow.jobs ?? {}).every((job) => job.permissions === undefined)).toBe(
        true
      );
    }
  });

  it.each([
    [
      autoMergePilotWorkflow,
      `permissions:
  actions: read
  checks: read
  contents: write
  issues: write
  pull-requests: write
jobs:
  admit:
    permissions:
      id-token: write
`,
    ],
    [
      circuitBreakerWorkflow,
      `permissions:
  actions: read
  contents: read
  issues: write
  pull-requests: read
jobs:
  evaluate:
    permissions: write-all
`,
    ],
  ])('rejects job-level permission overrides in privileged workflow %s', (path, contents) => {
    expect(() => validateWorkflowAutomationPolicy(contents, path)).toThrow(
      'Privileged workflow jobs must not override permissions'
    );
  });

  it('defines the exact-head Dependabot admission contract', () => {
    const workflow = readWorkflow(autoMergePilotWorkflow);
    const job = workflow.jobs?.admit;
    const steps = job?.steps ?? [];
    const contents = read(autoMergePilotWorkflow);
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    const metadata = steps.find((step) => step.uses?.startsWith('dependabot/fetch-metadata@'));
    const preflightIndex = steps.findIndex((step) => step.id === 'preflight');
    const waitIndex = steps.findIndex((step) => step.id === 'required-checks');
    const admissionIndex = steps.findIndex((step) => step.id === 'admission');
    const issueIndex = steps.findIndex((step) => step.id === 'state-issue');
    const mergeIndex = steps.findIndex((step) => step.id === 'enable-auto-merge');
    const preflightRun = steps[preflightIndex]?.run ?? '';
    const admissionRun = steps[admissionIndex]?.run ?? '';

    expect(workflow.on?.pull_request_target?.types).toEqual([
      'opened',
      'reopened',
      'synchronize',
      'ready_for_review',
    ]);
    expect(workflow.permissions).toEqual({
      actions: 'read',
      checks: 'read',
      contents: 'write',
      issues: 'write',
      'pull-requests': 'write',
    });
    expect(workflow.concurrency).toEqual({
      group: 'rss-dependabot-automerge-pilot',
      'cancel-in-progress': false,
    });
    expect(job?.if).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(job?.if).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(job?.if).toContain("github.event.pull_request.base.ref == 'main'");
    expect(job?.if).toContain('github.event.pull_request.draft == false');
    expect(checkout?.with).toEqual({
      ref: '${{ github.event.pull_request.base.sha }}',
      'persist-credentials': false,
    });
    expect(metadata?.uses).toBe(
      'dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98'
    );

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(waitIndex).toBeGreaterThan(preflightIndex);
    expect(admissionIndex).toBeGreaterThan(waitIndex);
    expect(issueIndex).toBeGreaterThan(admissionIndex);
    expect(mergeIndex).toBeGreaterThan(issueIndex);
    expect(steps[preflightIndex]?.run).toContain(
      'node scripts/dependabot-automerge-policy.cjs preflight'
    );
    expect(steps[waitIndex]?.run).toContain(
      'gh pr checks "$PR_URL" --repo "$GITHUB_REPOSITORY" --required --watch --fail-fast'
    );
    expect(steps[admissionIndex]?.run).toContain(
      'node scripts/dependabot-automerge-policy.cjs admission'
    );
    for (const [phase, run] of [
      ['preflight', preflightRun],
      ['admission', admissionRun],
    ]) {
      expect(run).toContain('gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main"');
      expect(run).toContain(`> "$RUNNER_TEMP/${phase}-main-ref.json"`);
      expect(run).toContain(
        `MAIN_SHA=$(jq -r '.object.sha' "$RUNNER_TEMP/${phase}-main-ref.json")`
      );
      expect(run).toContain(
        'gh api "repos/$GITHUB_REPOSITORY/compare/$MAIN_SHA...$CURRENT_HEAD_SHA"'
      );
      expect(run).not.toContain("jq -r '.base.sha'");
    }
    expect(admissionRun).toContain('echo "base-sha=$MAIN_SHA" >> "$GITHUB_OUTPUT"');
    expect(steps[issueIndex]?.run).toContain('rss-automerge-pilot-state');
    expect(steps[issueIndex]?.run).toContain('--label "rss-automerge-pilot-state"');
    expect(steps[mergeIndex]?.run).toContain('gh pr merge "$PR_URL"');
    expect(steps[mergeIndex]?.run).toContain('--match-head-commit "$EXPECTED_HEAD_SHA"');
    expect(contents.match(/gh issue list/g)).toHaveLength(2);
    expect(contents.match(/--label "rss-automerge-pilot-state"/g)).toHaveLength(3);

    for (const inputName of [
      'expectedHeadSha',
      'currentHeadSha',
      'updatedDependencies',
      'rulesetId',
      'rulesetStrict',
      'requiredChecks',
      'successfulChecks',
      'openStateIssues',
      'armedPullRequests',
    ]) {
      expect(contents).toContain(`${inputName}:`);
    }
    for (const context of [
      'lint-and-test (20)',
      'lint-and-test (22)',
      'claudelint',
      'Validate PR Title',
    ]) {
      expect(contents).toContain(context);
    }
    expect(contents).toContain('integrationId: 15368');
    expect(contents).toContain('prevVersion');
    expect(contents).toContain('newVersion');
    expect(contents).toContain('GITHUB_STEP_SUMMARY');
    expect(contents).not.toContain('--admin');
    expect(contents).not.toContain('secrets.');
    expect(contents).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.head(?:\.sha)?\s*\}\}/
    );
  });

  it('pauses the sentinel and fails visibly when the exact merge is not observed', () => {
    const workflow = readWorkflow(autoMergePilotWorkflow);
    const recordMergeRun =
      workflow.jobs?.admit?.steps?.find((step) => step.name === 'Record the exact merge SHA')
        ?.run ?? '';
    const timeoutBlock = recordMergeRun.split(
      'The exact merge was not observed within 60 seconds'
    )[1];

    expect(timeoutBlock).toContain('--add-label "rss-automerge-pilot-paused"');
    expect(timeoutBlock).toContain('exit 1');
    expect(timeoutBlock).not.toContain('--body');
  });

  it('defines an exact-merge-SHA CI circuit breaker', () => {
    const workflow = readWorkflow(circuitBreakerWorkflow);
    const job = workflow.jobs?.evaluate;
    const steps = job?.steps ?? [];
    const contents = read(circuitBreakerWorkflow);
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    const evaluateStep = steps.find((step) => step.id === 'evaluate-canaries');

    expect(workflow.on?.workflow_run).toEqual({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    });
    expect(workflow.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      issues: 'write',
      'pull-requests': 'read',
    });
    expect(workflow.concurrency).toEqual({
      group: 'rss-dependabot-automerge-pilot',
      'cancel-in-progress': false,
    });
    expect(job?.if).toContain("github.event.workflow_run.event == 'push'");
    expect(job?.if).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(checkout?.with).toEqual({
      ref: '${{ github.event.workflow_run.head_sha }}',
      'persist-credentials': false,
    });
    expect(evaluateStep?.run).toContain('rss-automerge-pilot-state');
    expect(evaluateStep?.run).toContain('parseStateIssue');
    expect(evaluateStep?.run).toContain('node scripts/dependabot-automerge-policy.cjs state-body');
    expect(evaluateStep?.run).toContain('node scripts/dependabot-automerge-policy.cjs canary');
    expect(evaluateStep?.run).toContain('gh issue list');
    expect(evaluateStep?.run).toContain('--label "rss-automerge-pilot-state"');
    expect(evaluateStep?.run).toMatch(
      /pause\)[\s\S]*--add-label "rss-automerge-pilot-paused"[\s\S]*gh issue comment/
    );
    expect(contents).toContain('github.event.workflow_run.head_sha');
    expect(contents).toContain('github.event.workflow_run.conclusion');
    expect(evaluateStep?.run).toMatch(
      /case "\$DECISION" in[\s\S]*clear\)[\s\S]*gh issue close[\s\S]*pause\)[\s\S]*gh issue comment/
    );
    expect(evaluateStep?.run).not.toMatch(/pause\)[\s\S]*gh issue close/);
    expect(contents).not.toContain('github.event.pull_request.head');
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
