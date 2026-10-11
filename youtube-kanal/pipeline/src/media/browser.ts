// Ortak Chromium başlatıcı. CHROMIUM_PATH tanımlıysa o tarayıcı kullanılır (ör. önceden kurulu sürüm);
// HTTPS_PROXY tanımlıysa sayfalar o vekil sunucu üzerinden açılır.

import { chromium, type Browser } from 'playwright';

export function launchBrowser(): Promise<Browser> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    proxy: proxy ? { server: proxy, bypass: '127.0.0.1,localhost' } : undefined,
    args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
  });
}
