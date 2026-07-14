import { defineConfig } from 'vitest/config';

const extended = process.env.LIVING_ECONOMY_EXTENDED === '1';

export default defineConfig({
  test: {
    exclude: extended
      ? ['**/node_modules/**']
      : ['**/node_modules/**', '**/livingEconomyCoreExtended.test.ts'],
  },
});
