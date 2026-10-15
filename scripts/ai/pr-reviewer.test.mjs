/**
 * Unit tests for AI PR Reviewer and Gemini Client logic.
 * Run with: node scripts/ai/pr-reviewer.test.mjs
 */

import assert from 'node:assert';
import { scrubSecrets } from './gemini-client.mjs';
import {
  shouldIgnoreFile,
  parseDiffChunks,
  filterAndBoundDiff,
  buildReviewPrompts
} from './pr-reviewer.mjs';

function runTests() {
  console.log('--- Testing scrubSecrets ---');
  {
    const sample = 'API key AIzaSyD9xYZ123456789012345678901234 and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const cleaned = scrubSecrets(sample);
    assert(!cleaned.includes('AIzaSyD9xYZ'), 'Google API key should be redacted');
    assert(!cleaned.includes('ghp_ABC'), 'GitHub PAT should be redacted');
    assert(cleaned.includes('[REDACTED_SECRET]'), 'Should contain redacted placeholder');
    console.log('✓ Token scrubbing passed');
  }

  {
    const bearerSample = 'Authorization: Bearer my-secret-jwt-token-12345';
    const cleaned = scrubSecrets(bearerSample);
    assert(!cleaned.includes('my-secret-jwt'), 'Bearer token should be redacted');
    console.log('✓ Bearer token scrubbing passed');
  }

  {
    const maskedCiSample = 'Sonar Token: *******';
    const cleaned = scrubSecrets(maskedCiSample);
    assert(cleaned.includes('[REDACTED_SECRET]'), 'Masked CI asterisks should be scrubbed');
    console.log('✓ Masked secret scrubbing passed');
  }

  console.log('--- Testing shouldIgnoreFile ---');
  {
    assert(shouldIgnoreFile('package-lock.json'), 'package-lock.json should be ignored');
    assert(shouldIgnoreFile('apps/frontend/package-lock.json'), 'nested lockfile should be ignored');
    assert(shouldIgnoreFile('.code-review-graph/graph.json'), 'graph files should be ignored');
    assert(shouldIgnoreFile('coverage/lcov.info'), 'coverage files should be ignored');
    assert(shouldIgnoreFile('assets/logo.png'), 'images should be ignored');
    assert(shouldIgnoreFile('services/user-service/.env'), '.env should be ignored');
    assert(!shouldIgnoreFile('services/user-service/src/index.js'), 'JS files should NOT be ignored');
    assert(!shouldIgnoreFile('gateway/routes/auth.ts'), 'TS files should NOT be ignored');
    console.log('✓ Ignore file filters passed');
  }

  console.log('--- Testing parseDiffChunks & filterAndBoundDiff ---');
  {
    const sampleDiff = `diff --git a/services/user-service/index.js b/services/user-service/index.js
index 123..456 100644
--- a/services/user-service/index.js
+++ b/services/user-service/index.js
@@ -1,3 +1,4 @@
+const express = require('express');
 const app = express();
diff --git a/package-lock.json b/package-lock.json
index 789..012 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -10,3 +10,4 @@
+ "version": "1.0.1"
`;

    const chunks = parseDiffChunks(sampleDiff);
    assert.strictEqual(chunks.length, 2, 'Should detect 2 chunks');
    assert.strictEqual(chunks[0].file, 'services/user-service/index.js');
    assert.strictEqual(chunks[1].file, 'package-lock.json');

    const result = filterAndBoundDiff(sampleDiff);
    assert.strictEqual(result.reviewedFiles.length, 1);
    assert.strictEqual(result.reviewedFiles[0], 'services/user-service/index.js');
    assert.strictEqual(result.ignoredFiles.length, 1);
    assert.strictEqual(result.ignoredFiles[0], 'package-lock.json');
    assert(!result.filteredDiff.includes('package-lock.json'), 'Ignored diff should be stripped');
    assert(result.filteredDiff.includes('const express'), 'Code diff should be retained');
    console.log('✓ Diff chunking and filtering passed');
  }

  console.log('--- Testing buildReviewPrompts ---');
  {
    const prompts = buildReviewPrompts({
      title: 'feat: add payment retry logic',
      body: 'Implements exponential backoff.',
      filteredDiff: '+function retry() {}',
      reviewedFiles: ['services/payment-service/retry.js'],
      ignoredFiles: [],
      truncated: false
    });

    assert(prompts.systemInstruction.includes('Principal Software Engineer'), 'System instruction should set persona');
    assert(prompts.systemInstruction.includes('SECURITY DIRECTIVE'), 'System instruction should include security directive');
    assert(prompts.userPrompt.includes('<untrusted_pr_diff>'), 'User prompt should enclose diff in untrusted tags');
    assert(prompts.userPrompt.includes('services/payment-service/retry.js'), 'User prompt should list reviewed files');
    console.log('✓ Prompt generation passed');
  }

  console.log('\nAll tests passed successfully! ✨');
}

runTests();
