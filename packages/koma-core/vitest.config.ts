import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.js'],
  },
  test: {
    name: 'koma-core',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        inline: [/koma-core/],
      },
    },
  },
});
