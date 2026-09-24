'use strict';

/**
 * Instagram'dan hesap açmadan herkese açık profil ve gönderi verisi çeker.
 *
 * Birden fazla kaynak sırayla denenir:
 *   1. web_profile_info  → tam profil + son 12 gönderi (ev/mobil IP'lerde genelde çalışır)
 *   2. /{kullanıcı}/embed → profil özeti + son gönderiler (veri merkezi IP'lerinde de çalışır)
 * Gönderi detayı (video adresi, carousel öğeleri) /p/{kod}/embed/captioned sayfasından alınır.
 */

const IG_APP_ID = '936619743392459';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const USERNAME_RE = /^[a-z0-9._]{1,30}$/;
const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,40}$/;

class IgError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Basit TTL önbellek — aynı profili tekrar tekrar istemek rate-limit'e yol açar.
// ---------------------------------------------------------------------------
class TtlCache {
  constructor(max = 500) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.val;
  }
  set(key, val, ttlMs) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { val, exp: Date.now() + ttlMs });
  }
}

const cache = new TtlCache();
const inflight = new Map();

/** Aynı anahtar için eşzamanlı istekleri tek bir upstream çağrısında birleştirir. */
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const val = await fn();
      cache.set(key, val, ttlMs);
      return val;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function request(url, { headers = {}, timeout = 12000, ...rest } = {}) {
  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        ...headers,
      },
      ...rest,
    });
  } catch (err) {
    throw new IgError('upstream', `Instagram'a bağlanılamadı: ${err.message}`, 502);
  }
}

async function fetchJson(url, headers) {
  const res = await request(url, {
    headers: { 'X-IG-App-ID': IG_APP_ID, Accept: 'application/json', ...headers },
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* HTML döndü (giriş sayfası vb.) */
  }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Embed sayfalarındaki "contextJSON" alanını çözümleme
// ---------------------------------------------------------------------------
function extractContextJson(html) {
  const key = '"contextJSON":';
  const start = html.indexOf(key);
  if (start < 0) return null;
  let i = start + key.length;
  if (html[i] !== '"') return null; // contextJSON:null → kullanıcı yok
  let j = i + 1;
  while (j < html.length) {
    const ch = html[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '"') break;
    j++;
  }
  try {
    return JSON.parse(JSON.parse(html.slice(i, j + 1)));
  } catch {
    return null;
  }
}

async function fetchEmbed(path) {
  const res = await request(`https://www.instagram.com${path}`, {
    headers: { Accept: 'text/html' },
  });
  if (res.status === 404) return null;
  if (res.status === 429) throw new IgError('rate_limited', 'Instagram şu an çok fazla istek aldığını söylüyor, biraz sonra tekrar dene.', 429);
  if (res.status !== 200) throw new IgError('upstream', `Instagram beklenmeyen yanıt verdi (${res.status}).`, 502);
  return extractContextJson(await res.text());
}

// ---------------------------------------------------------------------------
// Normalleştirme — farklı kaynakları tek bir biçime çevirir
// ---------------------------------------------------------------------------
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function bestResource(resources, fallback) {
  if (!Array.isArray(resources) || !resources.length) return fallback || null;
  return resources.reduce((a, b) => ((b.config_width || 0) > (a.config_width || 0) ? b : a)).src;
}

function thumbResource(resources, fallback) {
  if (!Array.isArray(resources) || !resources.length) return fallback || null;
  // ~640px genişlik ızgara için yeterli ve hızlı
  const sorted = [...resources].sort((a, b) => (a.config_width || 0) - (b.config_width || 0));
  return (sorted.find((r) => (r.config_width || 0) >= 480) || sorted[sorted.length - 1]).src;
}

function graphTypeOf(node) {
  const t = node.__typename || '';
  if (t === 'GraphSidecar' || t === 'XDTGraphSidecar' || node.edge_sidecar_to_children) return 'carousel';
  if (t === 'GraphVideo' || t === 'XDTGraphVideo' || node.is_video) return 'video';
  return 'image';
}

function normalizeGraphItem(node) {
  const isVideo = !!node.is_video || /Video/.test(node.__typename || '');
  return {
    id: String(node.id || ''),
    type: isVideo ? 'video' : 'image',
    url: bestResource(node.display_resources, node.display_url),
    videoUrl: node.video_url || null,
    width: node.dimensions?.width || null,
    height: node.dimensions?.height || null,
    alt: node.accessibility_caption || null,
  };
}

function normalizeGraphPost(node) {
  const type = graphTypeOf(node);
  const children = node.edge_sidecar_to_children?.edges?.map((e) => normalizeGraphItem(e.node)) || null;
  const self = normalizeGraphItem(node);
  return {
    id: String(node.id || ''),
    shortcode: node.shortcode,
    type,
    isReel: node.product_type === 'clips',
    thumb: thumbResource(node.thumbnail_resources || node.display_resources, node.thumbnail_src || node.display_url),
    width: node.dimensions?.width || null,
    height: node.dimensions?.height || null,
    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
    likes: num(node.edge_liked_by?.count ?? node.edge_media_preview_like?.count),
    comments: num(node.edge_media_to_comment?.count),
    views: num(node.video_view_count),
    duration: num(node.video_duration),
    timestamp: num(node.taken_at_timestamp),
    pinned: Array.isArray(node.pinned_for_users) && node.pinned_for_users.length > 0,
    items: children && children.length ? children : [self],
    // Embed profil verisinde video adresi yok; detay isteğiyle tamamlanır.
    complete: type === 'video' ? !!node.video_url : type === 'carousel' ? !!children?.length && children.every((c) => c.type !== 'video' || c.videoUrl) : true,
  };
}

// Mobil API (feed/user) öğeleri
function pickImage(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  return candidates.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a)).url;
}
function pickThumb(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((c) => (c.width || 0) >= 480) || sorted[sorted.length - 1]).url;
}
function normalizeApiItem(it) {
  const isVideo = it.media_type === 2 || !!it.video_versions;
  return {
    id: String(it.pk || it.id || ''),
    type: isVideo ? 'video' : 'image',
    url: pickImage(it.image_versions2?.candidates),
    videoUrl: isVideo ? pickImage(it.video_versions) : null,
    width: it.original_width || null,
    height: it.original_height || null,
    alt: it.accessibility_caption || null,
  };
}
function normalizeApiPost(it) {
  const carousel = Array.isArray(it.carousel_media) ? it.carousel_media.map(normalizeApiItem) : null;
  const self = normalizeApiItem(it);
  const type = carousel ? 'carousel' : self.type;
  const cover = carousel ? carousel[0] : self;
  return {
    id: String(it.pk || String(it.id || '').split('_')[0]),
    shortcode: it.code,
    type,
    isReel: it.product_type === 'clips',
    thumb: pickThumb((carousel ? it.carousel_media[0] : it).image_versions2?.candidates) || cover.url,
    width: it.original_width || cover.width,
    height: it.original_height || cover.height,
    caption: it.caption?.text || '',
    likes: num(it.like_count),
    comments: num(it.comment_count),
    views: num(it.play_count ?? it.view_count),
    duration: num(it.video_duration),
    timestamp: num(it.taken_at),
    pinned: Array.isArray(it.timeline_pinned_user_ids) && it.timeline_pinned_user_ids.length > 0,
    items: carousel || [self],
    complete: true,
  };
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
function normalizeUsername(input) {
  let u = String(input || '').trim();
  const m = u.match(/instagram\.com\/([^/?#]+)/i);
  if (m) u = m[1];
  u = u.replace(/^@/, '').toLowerCase();
  if (!USERNAME_RE.test(u)) throw new IgError('bad_request', 'Geçersiz kullanıcı adı.', 400);
  return u;
}

async function profileFromApi(username) {
  const { status, data } = await fetchJson(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { Referer: `https://www.instagram.com/${username}/` }
  );
  if (status === 404) throw new IgError('not_found', 'Bu kullanıcı bulunamadı.', 404);
  const u = data?.data?.user;
  if (status !== 200 || !u) {
    if (data && data.data && data.data.user === null) throw new IgError('not_found', 'Bu kullanıcı bulunamadı.', 404);
    return null; // bu kaynak kullanılamıyor → sonrakini dene
  }
  const timeline = u.edge_owner_to_timeline_media || {};
  return {
    user: {
      id: String(u.id),
      username: u.username,
      fullName: u.full_name || '',
      pic: u.profile_pic_url_hd || u.profile_pic_url,
      isVerified: !!u.is_verified,
      isPrivate: !!u.is_private,
      followers: num(u.edge_followed_by?.count),
      following: num(u.edge_follow?.count),
      postsCount: num(timeline.count),
      bio: u.biography || '',
      externalUrl: u.external_url || null,
      category: u.category_name || null,
    },
    posts: (timeline.edges || []).map((e) => normalizeGraphPost(e.node)),
    hasMore: !!timeline.page_info?.has_next_page,
    source: 'api',
  };
}

async function profileFromEmbed(username) {
  const ctx = await fetchEmbed(`/${encodeURIComponent(username)}/embed/`);
  const c = ctx?.context;
  if (!c || !c.username) throw new IgError('not_found', 'Bu kullanıcı bulunamadı ya da profil gizli.', 404);
  const media = (c.graphql_media || []).map((m) => m.shortcode_media).filter(Boolean);
  const owner = media[0]?.owner || {};
  const isPrivate = !!owner.is_private || (!media.length && (c.posts_count || 0) > 0);
  return {
    user: {
      id: String(c.owner_id || owner.id || ''),
      username: c.username,
      fullName: c.full_name || '',
      pic: c.profile_pic_url || owner.profile_pic_url || null,
      isVerified: !!(c.is_verified || c.verified),
      isPrivate,
      followers: num(c.followers_count),
      following: null,
      postsCount: num(c.posts_count),
      bio: '',
      externalUrl: null,
      category: null,
    },
    posts: media.map(normalizeGraphPost),
    hasMore: (c.posts_count || 0) > media.length && !isPrivate,
    source: 'embed',
  };
}

async function getProfile(input) {
  const username = normalizeUsername(input);
  return cached(`profile:${username}`, 3 * 60 * 1000, async () => {
    let apiError = null;
    try {
      const viaApi = await profileFromApi(username);
      if (viaApi) return viaApi;
    } catch (err) {
      if (err.code === 'not_found') throw err;
      apiError = err;
    }
    try {
      return await profileFromEmbed(username);
    } catch (err) {
      throw apiError && err.code !== 'not_found' ? apiError : err;
    }
  });
}

// ---------------------------------------------------------------------------
// Daha fazla gönderi (sayfalama). Instagram bunu giriş yapmadan çoğu zaman
// kısıtlar; başarısız olursa istemciye "daha fazla yok" olarak döneriz.
// ---------------------------------------------------------------------------
async function getMorePosts(userId, maxId) {
  if (!/^\d{1,30}$/.test(String(userId))) throw new IgError('bad_request', 'Geçersiz kullanıcı kimliği.', 400);
  if (maxId && !/^[\d_]{1,80}$/.test(String(maxId))) throw new IgError('bad_request', 'Geçersiz imleç.', 400);
  const cursor = maxId ? `${String(maxId).split('_')[0]}_${userId}` : '';
  return cached(`more:${userId}:${cursor}`, 3 * 60 * 1000, async () => {
    const qs = new URLSearchParams({ count: '12' });
    if (cursor) qs.set('max_id', cursor);
    const { status, data } = await fetchJson(`https://www.instagram.com/api/v1/feed/user/${userId}/?${qs}`, {
      'User-Agent': DESKTOP_UA,
      Referer: 'https://www.instagram.com/',
    });
    if (status !== 200 || !Array.isArray(data?.items)) {
      return { posts: [], hasMore: false, blocked: true };
    }
    return {
      posts: data.items.map(normalizeApiPost),
      hasMore: !!data.more_available,
      blocked: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Tek gönderi detayı (video adresi, carousel öğeleri)
// ---------------------------------------------------------------------------
async function getPost(shortcode) {
  if (!SHORTCODE_RE.test(String(shortcode))) throw new IgError('bad_request', 'Geçersiz gönderi kodu.', 400);
  return cached(`post:${shortcode}`, 10 * 60 * 1000, async () => {
    const ctx = await fetchEmbed(`/p/${shortcode}/embed/captioned/`);
    const node = ctx?.gql_data?.shortcode_media;
    if (!node) throw new IgError('not_found', 'Gönderi bulunamadı ya da gizli.', 404);
    const post = normalizeGraphPost(node);
    post.owner = node.owner
      ? { username: node.owner.username, pic: node.owner.profile_pic_url, isVerified: !!node.owner.is_verified }
      : null;
    return post;
  });
}

module.exports = {
  getProfile,
  getMorePosts,
  getPost,
  normalizeUsername,
  extractContextJson,
  normalizeGraphPost,
  normalizeApiPost,
  IgError,
  MOBILE_UA,
};
