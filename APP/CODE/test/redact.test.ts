import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { redactString, redactValue, resetSecretCache } from '../src/logging/redact.js';

const FAKE_SECRET = 'sk-test-supersecret-12345';

describe('redaction', () => {
  beforeEach(() => {
    process.env['TEST_FAKE_API_KEY'] = FAKE_SECRET;
    resetSecretCache();
  });
  afterEach(() => {
    delete process.env['TEST_FAKE_API_KEY'];
    resetSecretCache();
  });

  it('scrubs secret env values from strings', () => {
    expect(redactString(`auth with ${FAKE_SECRET} please`)).toBe('auth with [REDACTED] please');
  });

  it('scrubs secrets nested inside objects and arrays', () => {
    const redacted = redactValue({ list: [`x ${FAKE_SECRET}`], nested: { v: FAKE_SECRET } });
    expect(JSON.stringify(redacted)).not.toContain(FAKE_SECRET);
  });

  it('leaves non-secret content untouched', () => {
    expect(redactString('nothing secret here')).toBe('nothing secret here');
  });

  it('does not treat short env values as secrets', () => {
    process.env['SHORT_TOKEN'] = 'ab';
    resetSecretCache();
    expect(redactString('absolutely')).toBe('absolutely');
    delete process.env['SHORT_TOKEN'];
  });
});
