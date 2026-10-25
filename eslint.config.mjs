// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'drizzle/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: false },
    },
    rules: {
      // No stray logging: use the injected pino logger.
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports', prefer: 'type-imports' }],
      // Config is read in one place only (src/config). Everything else injects it.
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Read configuration through the typed config module (src/config).' },
      ],
    },
  },
  {
    // The Nest DI system needs real (non type-only) imports for decorated constructor params.
    files: ['src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    // Entry points, config loader and scripts may touch process.env / console directly.
    files: ['src/config/**', 'src/main.*.ts', 'src/infra/database/migrate.ts', 'drizzle.config.ts', 'test/**', 'scripts/**'],
    rules: { 'no-restricted-properties': 'off', 'no-console': 'off' },
  },
);
