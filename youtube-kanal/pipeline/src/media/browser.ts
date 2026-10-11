// Ortak Chromium başlatıcı. CHROMIUM_PATH tanımlıysa o tarayıcı kullanılır (ör. önceden kurulu sürüm).

import { chromium, type Browser } from 'playwright';

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
  });
}
