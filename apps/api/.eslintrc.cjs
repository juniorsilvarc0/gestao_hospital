// ESLint para o app NestJS. Estende o preset raiz (CLAUDE.md §5).
//
// Regras adicionais aqui são intencionalmente mínimas — a stack já é
// rígida via TypeScript strict + tsconfig.base.json. `any` continua
// proibido (rule herdada). `console.log` quebra build em produção:
// promovemos `no-console` de warn → error, com exceção de `warn`/`error`
// (alinhado com seed/script de bootstrap que precisam emitir mensagens
// quando o pino ainda não foi inicializado).
module.exports = {
  root: false,
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
  },
  overrides: [
    {
      // Specs podem relaxar regras pontualmente quando entrarem.
      files: ['**/*.spec.ts', '**/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', 'prisma/migrations'],
};
