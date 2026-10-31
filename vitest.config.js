import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.js'],
    setupFiles: ['src/test/setup.js'],
    restoreMocks: true,
    server: { deps: { inline: ['element-plus'] } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/**/*.spec.js', 'src/test/**'],
      thresholds: { lines: 80, branches: 70 },
    },
  },
})
