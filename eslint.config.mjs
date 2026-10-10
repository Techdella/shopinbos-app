import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'legacy/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/storybook-static/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/expo-env.d.ts',
      'packages/db/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Storybook render functions use hooks; they are components in practice.
    files: ['**/*.stories.tsx'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
