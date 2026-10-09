import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // config/topics.yaml web klasörünün dışında; geliştirme sunucusunun okuyabilmesi için
  server: { fs: { allow: ['..'] } },
});
