import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    environmentOptions: {
      happyDOM: {
        // Links in the sheet open new tabs; don't let the test DOM fetch them
        settings: { navigation: { disableChildPageNavigation: true, disableMainFrameNavigation: true } },
      },
    },
    coverage: {
      include: ['src/**/*.ts'],
      // Generated files, and the script-tag entry that only re-exports
      exclude: ['src/icons.ts', 'src/style.ts', 'src/global.ts'],
    },
    projects: [
      // Source, in happy-dom (`bun run test`)
      { extends: true, test: { name: 'unit', include: ['test/*.test.ts'] } },
      // The built dist/ files, as published (`bun run test:dist`, after `bun run build`)
      { extends: true, test: { name: 'dist', include: ['test/dist/*.test.ts'] } },
      // Source, in real browsers (`bun run test:browser`)
      {
        test: {
          name: 'browser',
          include: ['test/browser/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
    ],
  },
})
