/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  testTimeout: 30000,
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/types/**', '!src/config/env.ts'],
  coverageDirectory: 'coverage',
  verbose: false,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        // Type correctness is enforced by `npm run typecheck`; transpile-only
        // keeps the suite fast (tests/**/*.ts is still covered by that script).
        diagnostics: false,
      },
    ],
  },
};
