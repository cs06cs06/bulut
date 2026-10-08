import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/lib/config.ts';
import { LocalSqlite } from '../src/lib/db.ts';
import type { NormalizedRecord } from '../src/lib/normalize.ts';

export async function freshDb(): Promise<LocalSqlite> {
  const db = await LocalSqlite.open(':memory:');
  const dir = join(ROOT, 'db', 'migrations');
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  return db;
}

export function rec(over: Partial<NormalizedRecord>): NormalizedRecord {
  return {
    source: 'pubmed',
    sourceId: over.pmid ?? 'x',
    title: 'Ceftazidime-avibactam versus best available therapy for carbapenem-resistant Enterobacterales bacteremia',
    authors: [],
    pubTypes: [],
    mesh: [],
    keywords: [],
    grants: [],
    isPreprint: false,
    kind: 'article',
    pubDate: '2026-09-15',
    ...over,
  };
}
