'use strict';

const process = require('node:process');

const REPOSITORY = 'pdugan20/rss-feed-generator';
const BASE_BRANCH = 'main';
const RULESET_ID = 13514838;
const INTEGRATION_ID = 15368;
const REQUIRED_CHECKS = Object.freeze([
  'lint-and-test (20)',
  'lint-and-test (22)',
  'claudelint',
  'Validate PR Title',
]);
const ALLOWED_FILES = Object.freeze(['package.json', 'package-lock.json']);
const STATE_MARKER = 'rss-automerge-pilot-state-v1';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function hasExpectedFiles(files) {
  return (
    Array.isArray(files) &&
    files.length > 0 &&
    files.length <= ALLOWED_FILES.length &&
    new Set(files).size === files.length &&
    files.includes('package-lock.json') &&
    files.every((file) => ALLOWED_FILES.includes(file))
  );
}

function hasExpectedCheckBindings(checks) {
  if (!Array.isArray(checks) || checks.length !== REQUIRED_CHECKS.length) return false;

  const expectedBindings = new Set(
    REQUIRED_CHECKS.map((context) => `${context}\u0000${INTEGRATION_ID}`)
  );
  const actualBindings = new Set();

  for (const check of checks) {
    if (
      !check ||
      typeof check.context !== 'string' ||
      !Number.isInteger(check.integrationId) ||
      !expectedBindings.has(`${check.context}\u0000${check.integrationId}`)
    ) {
      return false;
    }
    actualBindings.add(`${check.context}\u0000${check.integrationId}`);
  }

  return actualBindings.size === expectedBindings.size;
}

function semanticMajor(version) {
  if (typeof version !== 'string') return null;

  const match = version.match(SEMVER_PATTERN);
  if (!match) return null;

  const major = Number(version.split('.', 1)[0]);
  return Number.isSafeInteger(major) ? major : null;
}

function updatedDependencyVersionReasons(updatedDependencies) {
  if (!Array.isArray(updatedDependencies) || updatedDependencies.length === 0) {
    return ['updated dependency versions must be present'];
  }

  let malformed = false;
  let preOne = false;
  for (const dependency of updatedDependencies) {
    const previousMajor = semanticMajor(dependency?.previousVersion);
    const newMajor = semanticMajor(dependency?.newVersion);

    if (previousMajor === null || newMajor === null) {
      malformed = true;
    } else if (previousMajor === 0 || newMajor === 0) {
      preOne = true;
    }
  }

  return [
    ...(malformed ? ['updated dependency versions must be valid semantic versions'] : []),
    ...(preOne ? ['pre-1.0 dependency updates are not eligible'] : []),
  ];
}

function evaluatePreflight(input) {
  const reasons = [];
  const { expectedHeadSha, currentHeadSha } = input;

  if (input.actor !== 'dependabot[bot]') reasons.push('author must be Dependabot');
  if (input.repository !== REPOSITORY) reasons.push('repository does not match this pilot');
  if (input.base !== BASE_BRANCH) reasons.push('base branch must be main');
  if (input.headRepository !== REPOSITORY) reasons.push('head repository must be this repository');
  if (input.draft !== false) reasons.push('draft pull requests are not eligible');
  if (!isSha(expectedHeadSha) || currentHeadSha !== expectedHeadSha) {
    reasons.push('head SHA changed');
  }
  if (input.updateType !== 'version-update:semver-patch') {
    reasons.push('update must be a patch update');
  }
  if (input.packageEcosystem !== 'npm') reasons.push('package ecosystem must be npm');
  if (input.directory !== '/') reasons.push('directory must be /');
  if (input.maintainerChanges !== false) reasons.push('maintainer changes are not allowed');
  if (!hasExpectedFiles(input.files)) {
    reasons.push('files must include package-lock.json and only package.json or package-lock.json');
  }
  if (input.allowAutoMerge !== true) reasons.push('repository auto-merge must be enabled');
  if (input.rulesetId !== RULESET_ID) reasons.push('required ruleset does not match');
  if (input.rulesetStrict !== true) reasons.push('ruleset must be strict');
  if (!hasExpectedCheckBindings(input.requiredChecks)) {
    reasons.push('required check bindings must exactly match the GitHub Actions App ruleset');
  }
  reasons.push(...updatedDependencyVersionReasons(input.updatedDependencies));

  return { candidate: reasons.length === 0, reasons };
}

function evaluateAdmission(input) {
  const preflight = evaluatePreflight(input);
  const reasons = [...preflight.reasons];

  if (input.behindBy !== 0) reasons.push('pull request must be on the current base');
  if (input.mergeable !== 'MERGEABLE') reasons.push('pull request must be mergeable');
  if (input.mergeStateStatus !== 'CLEAN') reasons.push('merge state must be clean');

  const successfulChecks = new Set(
    Array.isArray(input.successfulChecks) ? input.successfulChecks : []
  );
  if (!REQUIRED_CHECKS.every((check) => successfulChecks.has(check))) {
    reasons.push('required checks have not all succeeded');
  }
  if (input.openStateIssues !== 0) reasons.push('an open state issue already exists');
  if (input.armedPullRequests !== 0) reasons.push('another pull request is already armed');

  return { eligible: reasons.length === 0, reasons };
}

function isValidState(state) {
  return (
    state &&
    state.version === 1 &&
    Number.isInteger(state.prNumber) &&
    state.prNumber > 0 &&
    typeof state.prUrl === 'string' &&
    state.prUrl.length > 0 &&
    isSha(state.headSha) &&
    isSha(state.baseSha) &&
    isSha(state.mergeSha)
  );
}

function serializeStateIssue(state) {
  if (!isValidState(state)) throw new TypeError('invalid state issue');

  return [
    'RSS native auto-merge pilot state. Do not edit the machine marker below.',
    '',
    `<!-- ${STATE_MARKER}`,
    JSON.stringify(state),
    '-->',
  ].join('\n');
}

function parseStateIssue(body) {
  if (typeof body !== 'string') return null;

  const markerPattern = new RegExp(`<!-- ${STATE_MARKER}\\r?\\n([\\s\\S]*?)\\r?\\n-->`, 'g');
  const matches = [...body.matchAll(markerPattern)];
  if (matches.length !== 1) return null;

  try {
    const state = JSON.parse(matches[0][1]);
    return isValidState(state) ? state : null;
  } catch {
    return null;
  }
}

function evaluateCanary(input) {
  const { mergeSha, workflowHeadSha, conclusion } = input;

  if (!isSha(mergeSha) || !isSha(workflowHeadSha) || workflowHeadSha !== mergeSha) {
    return 'ignore';
  }
  return conclusion === 'success' ? 'clear' : 'pause';
}

function readInput() {
  const text = require('node:fs').readFileSync(0, 'utf8');
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('input must be a JSON object');
  }
  return parsed;
}

function runCli(command) {
  const input = readInput();
  switch (command) {
    case 'preflight':
      return evaluatePreflight(input);
    case 'admission':
      return evaluateAdmission(input);
    case 'state-body':
      return { body: serializeStateIssue(input) };
    case 'canary':
      return { decision: evaluateCanary(input) };
    default:
      throw new TypeError(`unknown command: ${command || ''}`);
  }
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(runCli(process.argv[2]))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  ALLOWED_FILES,
  BASE_BRANCH,
  INTEGRATION_ID,
  REQUIRED_CHECKS,
  REPOSITORY,
  RULESET_ID,
  STATE_MARKER,
  evaluateAdmission,
  evaluateCanary,
  evaluatePreflight,
  parseStateIssue,
  serializeStateIssue,
};
