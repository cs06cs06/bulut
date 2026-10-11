// "browser" sahneleri için gerçek web sayfalarının ekran görüntüleri.
// Video gerçek zamanlı kaydedilmez: her adımda bir ekran görüntüsü ve vurgulanacak öğenin konumu alınır;
// yakınlaştırma, imleç ve tıklama efektleri oluşturucuda (render) sonradan eklenir. Bu yöntem hem net
// (1080p) hem de anlatımla tam senkron olur.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Locator, Page } from 'playwright';
import type { BrowserStep, Scene } from '../lib/script.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shot {
  file: string;
  kind: 'show' | 'highlight' | 'scroll' | 'click' | 'after';
  box: Box | null;
  caption: string;
}

export interface SceneCapture {
  sceneId: string;
  url: string;
  ok: boolean;
  error?: string;
  shots: Shot[];
}

const VIEWPORT = { width: 1920, height: 1080 };
const COOKIE_BUTTONS = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|i agree|agree|got it|ok(ay)?|consent)$/i;
const BLOCKED_TITLES = /just a moment|attention required|access denied|verify you are human|captcha/i;

async function settle(page: Page, ms = 6000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {});
  await page.waitForTimeout(400);
}

async function dismissCookies(page: Page): Promise<void> {
  try {
    const btn = page.getByRole('button', { name: COOKIE_BUTTONS }).first();
    if (await btn.isVisible({ timeout: 1500 })) {
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(500);
    }
  } catch {
    /* çerez penceresi yok */
  }
}

/** Hedef metni sayfada bulur: önce erişilebilir rol adına göre bağlantı/düğme, sonra düz metin. */
async function findTarget(page: Page, target: string, preferClickable: boolean): Promise<Locator | null> {
  const candidates: Locator[] = [];
  if (preferClickable) {
    candidates.push(page.getByRole('link', { name: target }).first());
    candidates.push(page.getByRole('button', { name: target }).first());
  }
  candidates.push(page.getByText(target, { exact: true }).first());
  candidates.push(page.getByText(target).first());
  if (!preferClickable) {
    candidates.push(page.getByRole('heading', { name: target }).first());
  }
  for (const c of candidates) {
    try {
      if (await c.isVisible({ timeout: 800 })) return c;
    } catch {
      /* sonraki aday */
    }
  }
  return null;
}

async function viewportBox(loc: Locator): Promise<Box | null> {
  // Metin öğelerinde (başlık, paragraf) öğenin kendisi tüm satırı kaplayabilir; metnin sıkı sınırlarını tercih et.
  const textRect = await loc
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      return t.width > 2 && t.height > 2 && t.width < r.width * 0.9 ? { x: t.left, y: t.top, width: t.width, height: t.height } : null;
    })
    .catch(() => null);
  const b = textRect ?? (await loc.boundingBox().catch(() => null));
  if (!b || b.width < 2 || b.height < 2) return null;
  // Görünür alana kırp
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  const w = Math.min(VIEWPORT.width, b.x + b.width) - x;
  const h = Math.min(VIEWPORT.height, b.y + b.height) - y;
  return w > 2 && h > 2 ? { x, y, w, h } : null;
}

async function shoot(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
}

export async function captureScene(browser: Browser, scene: Scene, outDir: string): Promise<SceneCapture> {
  if (scene.visual.type !== 'browser') throw new Error('captureScene yalnızca browser sahneleri içindir');
  const { url, steps } = scene.visual;
  mkdirSync(outDir, { recursive: true });
  const result: SceneCapture = { sceneId: scene.id, url, ok: false, shots: [] };
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    colorScheme: 'light',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (res && res.status() >= 400) throw new Error(`Sayfa HTTP ${res.status()} döndürdü`);
    await settle(page);
    if (BLOCKED_TITLES.test(await page.title())) throw new Error('Site otomatik erişimi engelledi (bot koruması)');
    await dismissCookies(page);

    let n = 0;
    const file = () => join(outDir, `${scene.id}-${String(++n).padStart(2, '0')}.jpg`);
    for (const step of steps) await runStep(page, step, file, result.shots);
    result.ok = result.shots.length > 0;
  } catch (e) {
    result.error = (e as Error).message.split('\n')[0];
  } finally {
    await context.close();
  }
  return result;
}

async function runStep(page: Page, step: BrowserStep, file: () => string, shots: Shot[]): Promise<void> {
  const caption = step.caption;
  if (step.action === 'show' || !step.target) {
    if (!shots.length) await page.evaluate(() => window.scrollTo(0, 0));
    const f = file();
    await shoot(page, f);
    shots.push({ file: f, kind: 'show', box: null, caption });
    return;
  }

  const loc = await findTarget(page, step.target, step.action === 'click');
  if (!loc) {
    // Hedef bulunamadı: mevcut görünümü vurgusuz göster (video yine akar).
    const f = file();
    await shoot(page, f);
    shots.push({ file: f, kind: 'show', box: null, caption });
    return;
  }

  if (step.action === 'scroll') {
    await loc.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -140)); // sabit üst menünün altında kalsın
    await page.waitForTimeout(500);
    const f = file();
    await shoot(page, f);
    shots.push({ file: f, kind: 'scroll', box: await viewportBox(loc), caption });
    return;
  }

  await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const box = await viewportBox(loc);
  const f = file();
  await shoot(page, f);

  if (step.action === 'highlight') {
    shots.push({ file: f, kind: 'highlight', box, caption });
    return;
  }

  // click: önce tıklanacak öğe, sonra açılan sayfa
  shots.push({ file: f, kind: 'click', box, caption });
  const pagesBefore = page.context().pages().length;
  await loc.click({ timeout: 5000 }).catch(() => {});
  await settle(page, 8000);
  const pages = page.context().pages();
  const target = pages.length > pagesBefore ? pages[pages.length - 1] : page; // yeni sekmede açıldıysa
  await settle(target, 6000);
  await dismissCookies(target);
  const f2 = file();
  await shoot(target, f2);
  shots.push({ file: f2, kind: 'after', box: null, caption });
}

/** Bütün browser sahnelerini sırayla yakalar (önceden yakalananları atlar). */
export async function captureAll(
  browser: Browser,
  scenes: Scene[],
  outDir: string,
  previous: SceneCapture[] = [],
): Promise<SceneCapture[]> {
  const prev = new Map(previous.map((c) => [c.sceneId, c]));
  const out: SceneCapture[] = [];
  for (const scene of scenes) {
    if (scene.visual.type !== 'browser') continue;
    const p = prev.get(scene.id);
    if (p?.ok && p.url === scene.visual.url && p.shots.every((s) => existsSync(s.file))) {
      out.push(p);
      continue;
    }
    const c = await captureScene(browser, scene, outDir);
    console.log(`  ${scene.id} ${c.ok ? '✓' : '✗'} ${scene.visual.url}${c.error ? ` — ${c.error}` : ''}`);
    out.push(c);
  }
  return out;
}
