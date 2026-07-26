import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.js'],
  },
  test: {
    name: 'koma-scout',
    include: ['src/**/*.test.ts'],
  },
});
