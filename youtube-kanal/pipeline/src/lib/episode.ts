// Bölüm (video) klasörleri.
// episodes/<id>/  → depoya kaydedilen metinler (araştırma, senaryo, başlık/açıklama)
// work/<id>/      → depoya kaydedilmeyen büyük dosyalar (ses, ekran görüntüleri, video)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.ts';
import type { Topic } from './backlog.ts';

export interface EpisodeMeta {
  id: string;
  topic: Topic;
  created: string;
  updated: string;
  stages: Partial<Record<StageName, string>>; // aşama → bitiş zamanı
  cost_usd: number;
  duration_seconds?: number;
  youtube_id?: string;
  release_url?: string;
}

export type StageName = 'research' | 'script' | 'voice' | 'images' | 'clips' | 'capture' | 'render' | 'thumbnail' | 'metadata' | 'upload';

export class Episode {
  readonly dir: string;
  readonly work: string;
  meta: EpisodeMeta;

  private constructor(readonly id: string, meta: EpisodeMeta, root: string) {
    this.dir = join(root, 'episodes', id);
    this.work = join(root, 'work', id);
    this.meta = meta;
    mkdirSync(this.dir, { recursive: true });
    mkdirSync(this.work, { recursive: true });
  }

  static open(topic: Topic, root = ROOT, now = new Date()): Episode {
    const id = topic.episode ?? `${now.toISOString().slice(0, 10)}-${topic.id}`;
    const metaPath = join(root, 'episodes', id, 'episode.json');
    const meta: EpisodeMeta = existsSync(metaPath)
      ? JSON.parse(readFileSync(metaPath, 'utf8'))
      : { id, topic, created: now.toISOString(), updated: now.toISOString(), stages: {}, cost_usd: 0 };
    const ep = new Episode(id, meta, root);
    ep.save();
    return ep;
  }

  path(name: string): string {
    return join(this.dir, name);
  }

  workPath(...parts: string[]): string {
    const p = join(this.work, ...parts);
    return p;
  }

  has(name: string): boolean {
    return existsSync(this.path(name));
  }

  read(name: string): string {
    return readFileSync(this.path(name), 'utf8');
  }

  readJson<T>(name: string): T {
    return JSON.parse(this.read(name)) as T;
  }

  write(name: string, content: string): void {
    writeFileSync(this.path(name), content);
  }

  writeJson(name: string, data: unknown): void {
    this.write(name, JSON.stringify(data, null, 2) + '\n');
  }

  done(stage: StageName): boolean {
    return !!this.meta.stages[stage];
  }

  finish(stage: StageName): void {
    this.meta.stages[stage] = new Date().toISOString();
    this.save();
  }

  addCost(usd: number): void {
    this.meta.cost_usd = Math.round((this.meta.cost_usd + usd) * 10000) / 10000;
    this.save();
  }

  save(): void {
    this.meta.updated = new Date().toISOString();
    writeFileSync(join(this.dir, 'episode.json'), JSON.stringify(this.meta, null, 2) + '\n');
  }
}
