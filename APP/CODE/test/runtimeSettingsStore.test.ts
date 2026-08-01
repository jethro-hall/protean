import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deleteProvider,
  getProviderConfig,
  listProviders,
  saveProvider,
} from '../src/config/runtimeSettingsStore.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'protean-runtime-settings-test-'));
}

describe('runtimeSettingsStore', () => {
  it('starts empty', () => {
    expect(listProviders(tempDir())).toEqual([]);
  });

  it('saves a provider and redacts its secret in the summary', () => {
    const dir = tempDir();
    saveProvider(dir, { label: 'My Claude account', config: { type: 'anthropic', apiKey: 'sk-ant-abcdef1234' } });
    const [summary] = listProviders(dir);
    expect(summary?.label).toBe('My Claude account');
    expect(summary?.type).toBe('anthropic');
    expect(summary?.secretRedacted).toBe('***1234');
    expect(summary?.secretRedacted).not.toContain('sk-ant-abcdef');
  });

  it('shows non-secret detail (region / base URL) for bedrock and openai-compatible', () => {
    const dir = tempDir();
    saveProvider(dir, { label: 'Prod Bedrock', config: { type: 'bedrock', awsRegion: 'us-east-1', bearerToken: 'tok-9999' } });
    saveProvider(dir, {
      label: 'Local vLLM',
      config: { type: 'openai-compatible', baseUrl: 'https://vllm.example.com', apiKey: 'key-5555' },
    });
    const summaries = listProviders(dir);
    expect(summaries.find((s) => s.label === 'Prod Bedrock')?.detail).toBe('us-east-1');
    expect(summaries.find((s) => s.label === 'Local vLLM')?.detail).toBe('https://vllm.example.com');
  });

  it('updates an existing provider in place when given its id, preserving createdAt', () => {
    const dir = tempDir();
    const first = saveProvider(dir, { label: 'V1', config: { type: 'anthropic', apiKey: 'sk-1111' } });
    const second = saveProvider(dir, {
      id: first.id,
      label: 'V2',
      config: { type: 'anthropic', apiKey: 'sk-2222' },
    });
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(listProviders(dir)).toHaveLength(1);
    expect(listProviders(dir)[0]?.label).toBe('V2');
  });

  it('getProviderConfig returns the raw config for the live test/list-models calls', () => {
    const dir = tempDir();
    const record = saveProvider(dir, { label: 'X', config: { type: 'anthropic', apiKey: 'sk-real-secret' } });
    const config = getProviderConfig(dir, record.id);
    expect(config).toEqual({ type: 'anthropic', apiKey: 'sk-real-secret' });
  });

  it('getProviderConfig returns undefined for an unknown id', () => {
    expect(getProviderConfig(tempDir(), 'does-not-exist')).toBeUndefined();
  });

  it('deletes a provider by id and reports whether anything was removed', () => {
    const dir = tempDir();
    const record = saveProvider(dir, { label: 'Y', config: { type: 'anthropic', apiKey: 'sk-y' } });
    expect(deleteProvider(dir, record.id)).toBe(true);
    expect(listProviders(dir)).toEqual([]);
    expect(deleteProvider(dir, record.id)).toBe(false);
  });
});
