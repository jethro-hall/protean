import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      // Law 6: lineage goes through the structured logger, never bare console.
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The spike script and human log renderer are the two sanctioned stdout writers.
    files: ['src/spike.ts', 'src/logging/render.ts'],
    rules: { 'no-console': 'off' },
  },
);
