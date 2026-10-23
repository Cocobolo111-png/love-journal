import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    publicDir: process.env.LOVE_JOURNAL_PUBLIC_DIR ?? 'public',
    define: { __PUBLISHED_JOURNAL__: JSON.stringify(process.env.LOVE_JOURNAL_MODE === 'published') },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: { host: '127.0.0.1', port: 4180, strictPort: true },
    plugins: [vinext(), cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      config: { main: 'vinext/server/fetch-handler', compatibility_flags: ['nodejs_compat'] },
    })],
  };
});
