const policy = require('../scripts/dependabot-automerge-policy.cjs');

type AdmissionInput = {
  actor: string;
  repository: string;
  base: string;
  headRepository: string;
  draft: boolean;
  expectedHeadSha: string;
  currentHeadSha: string;
  updateType: string;
  packageEcosystem: string;
  directory: string;
  maintainerChanges: boolean;
  files: string[];
  rulesetId: number;
  rulesetEnforcement: string;
  rulesetTarget: string;
  rulesetInclude: string[];
  rulesetExclude: string[];
  rulesetStrict: boolean;
  requiredChecks: Array<{ context: string; integrationId: number }>;
  updatedDependencies: Array<{ previousVersion: string; newVersion: string }>;
  behindBy: number;
  mergeable: string;
  mergeStateStatus: string;
  successfulChecks: string[];
  openStateIssues: number;
  armedPullRequests: number;
};

const headSha = 'a'.repeat(40);
const requiredCheckBindings = [
  { context: 'lint-and-test (20)', integrationId: 15368 },
  { context: 'lint-and-test (22)', integrationId: 15368 },
  { context: 'claudelint', integrationId: 15368 },
  { context: 'Validate PR Title', integrationId: 15368 },
];

function validInput(): AdmissionInput {
  return {
    actor: 'dependabot[bot]',
    repository: 'pdugan20/rss-feed-generator',
    base: 'main',
    headRepository: 'pdugan20/rss-feed-generator',
    draft: false,
    expectedHeadSha: headSha,
    currentHeadSha: headSha,
    updateType: 'version-update:semver-patch',
    packageEcosystem: 'npm_and_yarn',
    directory: '/',
    maintainerChanges: false,
    files: ['package.json', 'package-lock.json'],
    rulesetId: 13514838,
    rulesetEnforcement: 'active',
    rulesetTarget: 'branch',
    rulesetInclude: ['~DEFAULT_BRANCH'],
    rulesetExclude: [],
    rulesetStrict: true,
    requiredChecks: requiredCheckBindings,
    updatedDependencies: [{ previousVersion: '1.2.3', newVersion: '1.2.4' }],
    behindBy: 0,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    successfulChecks: requiredCheckBindings.map(({ context }) => context),
    openStateIssues: 0,
    armedPullRequests: 0,
  };
}

describe('Dependabot auto-merge policy', () => {
  const rejectedCases: Array<[string, Partial<AdmissionInput>, string]> = [
    ['non-Dependabot author', { actor: 'pdugan20' }, 'author'],
    ['fork head', { headRepository: 'fork/rss-feed-generator' }, 'head repository'],
    ['draft', { draft: true }, 'draft'],
    ['changed head', { currentHeadSha: 'b'.repeat(40) }, 'head SHA'],
    ['minor update', { updateType: 'version-update:semver-minor' }, 'patch'],
    ['legacy npm ecosystem value', { packageEcosystem: 'npm' }, 'npm_and_yarn'],
    ['actions update', { packageEcosystem: 'github-actions' }, 'npm_and_yarn'],
    ['other ecosystem', { packageEcosystem: 'bundler' }, 'npm_and_yarn'],
    ['wrong directory', { directory: '/tools' }, 'directory'],
    ['maintainer changes', { maintainerChanges: true }, 'maintainer'],
    ['workflow diff', { files: ['package-lock.json', '.github/workflows/ci.yml'] }, 'files'],
    ['missing lockfile', { files: ['package.json'] }, 'package-lock.json'],
    ['stale base', { behindBy: 1 }, 'current base'],
    ['conflict', { mergeable: 'CONFLICTING' }, 'mergeable'],
    ['inactive ruleset', { rulesetEnforcement: 'disabled' }, 'active'],
    ['non-branch ruleset', { rulesetTarget: 'tag' }, 'branch'],
    ['missing default branch include', { rulesetInclude: [] }, 'default branch'],
    [
      'extra ruleset include',
      { rulesetInclude: ['~DEFAULT_BRANCH', 'refs/heads/release'] },
      'default branch',
    ],
    ['ruleset exclusion', { rulesetExclude: ['refs/heads/main'] }, 'exclude'],
    ['non-strict ruleset', { rulesetStrict: false }, 'strict'],
    [
      'wrong App binding',
      {
        requiredChecks: [
          requiredCheckBindings[0],
          requiredCheckBindings[1],
          requiredCheckBindings[2],
          { context: 'Validate PR Title', integrationId: 0 },
        ],
      },
      'required check bindings',
    ],
    [
      'duplicate required check binding',
      {
        requiredChecks: [
          requiredCheckBindings[0],
          requiredCheckBindings[1],
          requiredCheckBindings[2],
          requiredCheckBindings[2],
        ],
      },
      'required check bindings',
    ],
    [
      'missing required check binding',
      { requiredChecks: requiredCheckBindings.slice(0, 3) },
      'required check bindings',
    ],
    [
      'extra required check binding',
      {
        requiredChecks: [
          ...requiredCheckBindings,
          { context: 'untrusted-check', integrationId: 15368 },
        ],
      },
      'required check bindings',
    ],
    [
      'renamed required check binding',
      {
        requiredChecks: [
          requiredCheckBindings[0],
          requiredCheckBindings[1],
          requiredCheckBindings[2],
          { context: 'Validate title', integrationId: 15368 },
        ],
      },
      'required check bindings',
    ],
    [
      'malformed dependency version',
      { updatedDependencies: [{ previousVersion: 'not-a-version', newVersion: '1.2.4' }] },
      'version',
    ],
    [
      'non-semver prerelease dependency version',
      { updatedDependencies: [{ previousVersion: '1.2.3-01', newVersion: '1.2.4' }] },
      'version',
    ],
    [
      'previous prerelease dependency version',
      { updatedDependencies: [{ previousVersion: '1.2.3-rc.1', newVersion: '1.2.3' }] },
      'prerelease',
    ],
    [
      'new prerelease dependency version',
      { updatedDependencies: [{ previousVersion: '1.2.3', newVersion: '1.2.4-beta.1' }] },
      'prerelease',
    ],
    [
      'grouped prerelease dependency version',
      {
        updatedDependencies: [
          { previousVersion: '1.2.3', newVersion: '1.2.4' },
          { previousVersion: '2.3.4-alpha.1', newVersion: '2.3.4' },
        ],
      },
      'prerelease',
    ],
    [
      'pre-1.0 single dependency',
      { updatedDependencies: [{ previousVersion: '0.9.0', newVersion: '1.0.0' }] },
      'pre-1.0',
    ],
    [
      'pre-1.0 new dependency version',
      { updatedDependencies: [{ previousVersion: '1.0.0', newVersion: '0.9.0' }] },
      'pre-1.0',
    ],
    [
      'pre-1.0 grouped dependency',
      {
        updatedDependencies: [
          { previousVersion: '1.2.3', newVersion: '1.2.4' },
          { previousVersion: '0.9.0', newVersion: '0.9.1' },
        ],
      },
      'pre-1.0',
    ],
    ['missing required check', { successfulChecks: ['lint-and-test (20)'] }, 'required checks'],
    ['open state issue', { openStateIssues: 1 }, 'state issue'],
    ['another armed PR', { armedPullRequests: 1 }, 'armed'],
  ];

  it('marks a valid preflight as a candidate', () => {
    expect(policy.evaluatePreflight(validInput())).toEqual({ candidate: true, reasons: [] });
  });

  it('marks a valid admission as eligible', () => {
    expect(policy.evaluateAdmission(validInput())).toEqual({ eligible: true, reasons: [] });
  });

  it('admits stable dependency versions with build metadata', () => {
    expect(
      policy.evaluateAdmission({
        ...validInput(),
        updatedDependencies: [
          { previousVersion: '1.2.3+build-old', newVersion: '1.2.4+build-new.1' },
        ],
      })
    ).toEqual({ eligible: true, reasons: [] });
  });

  it('fails closed when admission data is incomplete', () => {
    expect(policy.evaluateAdmission({}).eligible).toBe(false);
  });

  it.each(rejectedCases)('rejects %s', (_description, mutation, reason) => {
    const result = policy.evaluateAdmission({ ...validInput(), ...mutation });

    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toContain(reason);
  });

  it('admits a lockfile-only dependency patch', () => {
    expect(policy.evaluateAdmission({ ...validInput(), files: ['package-lock.json'] })).toEqual({
      eligible: true,
      reasons: [],
    });
  });

  it.each([
    ['empty', []],
    ['manifest-only', ['package.json']],
    ['extra path', ['package-lock.json', 'README.md']],
    ['duplicate lockfile', ['package-lock.json', 'package-lock.json']],
    ['non-array', 'package-lock.json'],
  ])('rejects %s changed files', (_description, files) => {
    const result = policy.evaluateAdmission({
      ...validInput(),
      files,
    } as unknown as AdmissionInput);

    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toContain('files');
  });

  it.each([
    ['missing expected SHA', { currentHeadSha: headSha }],
    ['missing current SHA', { expectedHeadSha: headSha }],
    ['malformed equal SHAs', { expectedHeadSha: 'bad', currentHeadSha: 'bad' }],
    ['legacy head SHA alias', { headSha }],
  ])('rejects %s during preflight', (_description, values) => {
    const input = { ...validInput(), ...values } as Record<string, unknown>;
    delete input.expectedHeadSha;
    delete input.currentHeadSha;
    Object.assign(input, values);

    expect(policy.evaluatePreflight(input).candidate).toBe(false);
    expect(policy.evaluatePreflight(input).reasons.join(' ')).toContain('head SHA');
  });

  it('round-trips a state issue body', () => {
    const state = {
      version: 1,
      prNumber: 42,
      prUrl: 'https://github.com/pdugan20/rss-feed-generator/pull/42',
      headSha,
      baseSha: 'b'.repeat(40),
      mergeSha: 'c'.repeat(40),
    };

    const body = policy.serializeStateIssue(state);

    expect(body).toContain('<!-- rss-automerge-pilot-state-v1');
    expect(policy.parseStateIssue(body)).toEqual(state);
  });

  it.each([
    'no marker here',
    '<!-- rss-automerge-pilot-state-v1\nnot json\n-->',
    '<!-- rss-automerge-pilot-state-v1\n{"version":2,"prNumber":42,"headSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","baseSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","mergeSha":"cccccccccccccccccccccccccccccccccccccccc"}\n-->',
    '<!-- rss-automerge-pilot-state-v1\n{"version":1,"prNumber":42.5,"headSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","baseSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","mergeSha":"cccccccccccccccccccccccccccccccccccccccc"}\n-->',
    '<!-- rss-automerge-pilot-state-v1\n{"version":1,"prNumber":42,"headSha":"bad","baseSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","mergeSha":"cccccccccccccccccccccccccccccccccccccccc"}\n-->',
    '<!-- rss-automerge-pilot-state-v1\n{"version":1,"prNumber":42,"prUrl":"https://github.com/pdugan20/rss-feed-generator/pull/42","headSha":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"baseSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","mergeSha":"cccccccccccccccccccccccccccccccccccccccc"}\n-->',
  ])('fails closed for malformed state marker %s', (body) => {
    expect(policy.parseStateIssue(body)).toBeNull();
  });

  it.each([
    ['success', headSha, 'clear'],
    ['failure', headSha, 'pause'],
    ['cancelled', headSha, 'pause'],
    ['timed_out', headSha, 'pause'],
    ['success', 'b'.repeat(40), 'ignore'],
  ])('returns %s canary decision for %s', (conclusion, workflowHeadSha, decision) => {
    expect(
      policy.evaluateCanary({
        mergeSha: headSha,
        workflowHeadSha,
        conclusion,
      })
    ).toBe(decision);
  });

  it.each([
    ['missing both SHAs', {}],
    ['missing merge SHA', { workflowHeadSha: headSha }],
    ['missing workflow SHA', { mergeSha: headSha }],
    ['equal malformed SHAs', { mergeSha: 'bad', workflowHeadSha: 'bad' }],
    ['equal non-SHA strings', { mergeSha: 'not-a-sha', workflowHeadSha: 'not-a-sha' }],
  ])('ignores canaries with %s', (_description, values) => {
    expect(policy.evaluateCanary({ conclusion: 'success', ...values })).toBe('ignore');
  });
});
