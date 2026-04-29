// ESLint config raiz — preset mínimo. Apps/packages podem estender com regras
// específicas (ex.: NestJS em apps/api, React em apps/web).
//
// Plugins reais (@typescript-eslint, eslint-config-prettier) entram nas
// dependências dos workspaces respectivos. Este arquivo serve como contrato:
// estilo unificado, deny-by-default em "any", import order via prettier.
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'warn',
    eqeqeq: ['error', 'always'],
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.turbo',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
    'prisma/migrations',
  ],
};
