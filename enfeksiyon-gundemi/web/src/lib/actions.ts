// Tarayıcı tarafı işlemler: kaydet, okundu, paylaş.

export async function setState(id: number, change: { read?: boolean; saved?: boolean }): Promise<boolean> {
  try {
    const res = await fetch('/api/durum', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...change }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Paylaşım: uygulama kişisel ve giriş korumalı olduğu için uygulama bağlantısı değil,
 * yayının orijinal bağlantısı (DOI/PubMed) paylaşılır.
 */
export async function shareWork(w: { title_tr: string; hook?: string; doi: string | null; pmid: string | null }): Promise<string | null> {
  const url = w.doi ? `https://doi.org/${w.doi}` : w.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${w.pmid}/` : undefined;
  const text = w.hook ? `${w.title_tr}\n\n${w.hook}` : w.title_tr;
  try {
    if (navigator.share) {
      await navigator.share({ title: w.title_tr, text, url });
      return null;
    }
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'Bağlantı panoya kopyalandı';
  } catch {
    return null; // kullanıcı paylaşımı iptal etti
  }
}
