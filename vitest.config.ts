import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/app/api/**'],
    },
  },
})
