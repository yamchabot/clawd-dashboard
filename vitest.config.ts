import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'],
    reporters: ['verbose'],
  },
})
