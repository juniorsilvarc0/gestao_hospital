// ESLint para apps/web — estende o preset raiz e adiciona regras React.
module.exports = {
  root: false,
  extends: [
    '../../.eslintrc.cjs',
    'plugin:react-hooks/recommended',
  ],
  plugins: ['react-refresh'],
  env: {
    browser: true,
    es2022: true,
    node: false,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: [
    'dist',
    'build',
    'coverage',
    'node_modules',
    '.turbo',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
  ],
};
