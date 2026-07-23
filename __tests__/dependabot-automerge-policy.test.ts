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
  allowAutoMerge: boolean;
  rulesetId: number;
  rulesetStrict: boolean;
  requiredCheckIntegrationIds: number[];
  behindBy: number;
  mergeable: string;
  mergeStateStatus: string;
  successfulChecks: string[];
  openStateIssues: number;
  armedPullRequests: number;
};

const headSha = 'a'.repeat(40);
const requiredChecks = [
  'lint-and-test (20)',
  'lint-and-test (22)',
  'claudelint',
  'Validate PR Title',
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
    packageEcosystem: 'npm',
    directory: '/',
    maintainerChanges: false,
    files: ['package.json', 'package-lock.json'],
    allowAutoMerge: true,
    rulesetId: 13514838,
    rulesetStrict: true,
    requiredCheckIntegrationIds: [15368, 15368, 15368, 15368],
    behindBy: 0,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    successfulChecks: requiredChecks,
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
    ['actions update', { packageEcosystem: 'github-actions' }, 'npm'],
    ['wrong directory', { directory: '/tools' }, 'directory'],
    ['maintainer changes', { maintainerChanges: true }, 'maintainer'],
    ['workflow diff', { files: ['package-lock.json', '.github/workflows/ci.yml'] }, 'files'],
    ['missing lockfile', { files: ['package.json'] }, 'package-lock.json'],
    ['stale base', { behindBy: 1 }, 'current base'],
    ['conflict', { mergeable: 'CONFLICTING' }, 'mergeable'],
    ['disabled repository auto-merge', { allowAutoMerge: false }, 'repository auto-merge'],
    ['non-strict ruleset', { rulesetStrict: false }, 'strict'],
    ['wrong App binding', { requiredCheckIntegrationIds: [15368, 15368, 15368, 0] }, 'App'],
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

  it('fails closed when admission data is incomplete', () => {
    expect(policy.evaluateAdmission({}).eligible).toBe(false);
  });

  it.each(rejectedCases)('rejects %s', (_description, mutation, reason) => {
    const result = policy.evaluateAdmission({ ...validInput(), ...mutation });

    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toContain(reason);
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
        expectedHeadSha: headSha,
        workflowHeadSha,
        conclusion,
      })
    ).toBe(decision);
  });

  it('ignores a canary without both exact SHA values', () => {
    expect(policy.evaluateCanary({ conclusion: 'success', workflowHeadSha: headSha })).toBe(
      'ignore'
    );
  });
});
