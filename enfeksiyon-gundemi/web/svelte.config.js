import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // Varsayılan: Cloudflare Pages (wrangler.toml). EG_WRANGLER_CONFIG=wrangler.worker.toml ile
    // aynı uygulama workers.dev adresi için Worker olarak derlenir (pages.dev Türkiye'de engelli).
    adapter: adapter({ config: process.env.EG_WRANGLER_CONFIG || undefined }),
  },
};
