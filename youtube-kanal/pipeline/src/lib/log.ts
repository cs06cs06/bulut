// Günlük yardımcıları: GitHub Actions'ta uyarı ve hatalar çalıştırma özetinde de görünür.

import { appendFileSync } from 'node:fs';

const gha = !!process.env.GITHUB_ACTIONS;

export const log = (msg: string) => console.log(msg);
export const warn = (msg: string) => console.log(gha ? `::warning::${msg}` : `⚠️  ${msg}`);
export const fail = (msg: string) => console.log(gha ? `::error::${msg}` : `❌ ${msg}`);

/** Sonraki iş akışı adımlarına değer aktarır (GITHUB_OUTPUT). */
export function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, value.includes('\n') ? `${name}<<EOF_OUT\n${value}\nEOF_OUT\n` : `${name}=${value}\n`);
}

/** Çalıştırma sayfasındaki özet bölümüne Markdown yazar. */
export function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, markdown + '\n');
}
