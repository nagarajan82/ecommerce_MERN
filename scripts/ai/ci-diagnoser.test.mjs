/**
 * Unit tests for AI CI Diagnoser logic.
 * Run with: node scripts/ai/ci-diagnoser.test.mjs
 */

import assert from 'node:assert';
import {
  stripAnsi,
  extractRelevantLog,
  buildDiagnosisPrompts
} from './ci-diagnoser.mjs';

function runTests() {
  console.log('--- Testing stripAnsi ---');
  {
    const colored = '\x1b[31m✖ Quality Gate has FAILED.\x1b[0m';
    const plain = stripAnsi(colored);
    assert.strictEqual(plain, '✖ Quality Gate has FAILED.');
    console.log('✓ ANSI code stripping passed');
  }

  console.log('--- Testing extractRelevantLog ---');
  {
    const sampleLog = `
2026-10-14T19:30:20.000Z Starting test run
Temporarily overriding HOME='/home/runner/work/_temp/123'
git config --global --add safe.directory /home/runner/work
2026-10-14T19:30:25.000Z Running Jest tests
FAIL services/payment-service/test/payment.test.js
  ● processPayment › should handle gateway timeout
    AssertionError: expected 'FAILED' to equal 'PENDING'
      at Object.<anonymous> (test/payment.test.js:45:12)
Cleaning up orphan processes
Post job cleanup.
`;

    const excerpt = extractRelevantLog(sampleLog);
    assert(excerpt.includes('FAIL services/payment-service'), 'Should capture FAIL line');
    assert(excerpt.includes('AssertionError'), 'Should capture AssertionError');
    assert(!excerpt.includes('Temporarily overriding HOME'), 'Should filter noise line');
    assert(!excerpt.includes('Cleaning up orphan processes'), 'Should filter orphan cleanup noise');
    console.log('✓ Error extraction and noise pruning passed');
  }

  console.log('--- Testing buildDiagnosisPrompts ---');
  {
    const failedJobs = [
      {
        id: 12345,
        name: 'Test (services/payment-service)',
        failedSteps: ['Run unit tests with coverage'],
        htmlUrl: 'https://github.com/org/repo/actions/runs/1/job/12345',
        logExcerpt: 'FAIL payment.test.js\nAssertionError: expected 500 to be 200'
      }
    ];

    const prompts = buildDiagnosisPrompts({
      workflowName: 'PR Validation & CI',
      runId: '987654321',
      runUrl: 'https://github.com/org/repo/actions/runs/987654321',
      event: 'pull_request',
      headBranch: 'feature/payments',
      headSha: 'abc1234567890',
      failedJobs
    });

    assert(prompts.systemInstruction.includes('Principal DevOps'), 'System instruction should set DevOps persona');
    assert(prompts.systemInstruction.includes('Confirmed Facts'), 'Should demand confirmed facts vs hypotheses');
    assert(prompts.userPrompt.includes('<untrusted_ci_logs>'), 'Should enclose logs in untrusted tags');
    assert(prompts.userPrompt.includes('FAILED JOB 1: Test (services/payment-service)'), 'Should format failed job context');
    console.log('✓ Diagnosis prompt construction passed');
  }

  console.log('\nAll CI Diagnoser tests passed successfully! ✨');
}

runTests();
