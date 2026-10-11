// YouTube Data API v3: video, kapak ve altyazı yükleme (isteğe bağlı; config/channel.yaml → youtube.upload).
// Kimlik: OAuth istemcisi + yenileme belirteci (README'de adım adım anlatılıyor).

import { readFileSync, statSync } from 'node:fs';

export interface YoutubeCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function credsFromEnv(env = process.env): YoutubeCreds {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    throw new Error('YouTube yüklemesi için YT_CLIENT_ID, YT_CLIENT_SECRET ve YT_REFRESH_TOKEN gizli değerleri gerekli');
  }
  return { clientId: YT_CLIENT_ID, clientSecret: YT_CLIENT_SECRET, refreshToken: YT_REFRESH_TOKEN };
}

async function accessToken(c: YoutubeCreds): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(`YouTube oturumu açılamadı: ${data.error ?? res.status} ${data.error_description ?? ''}`.trim());
  }
  return data.access_token;
}

async function check(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.text()).slice(0, 800);
  throw new Error(`YouTube ${what} hatası (HTTP ${res.status}): ${body}`);
}

export interface UploadInput {
  videoFile: string;
  thumbnailFile?: string;
  srtFile?: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacy: 'private' | 'unlisted' | 'public';
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  language: string;
}

export async function uploadVideo(creds: YoutubeCreds, input: UploadInput): Promise<{ id: string; warnings: string[] }> {
  const token = await accessToken(creds);
  const auth = { authorization: `Bearer ${token}` };
  const warnings: string[] = [];

  // 1) Sürdürülebilir (resumable) yükleme oturumu
  const meta = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description,
      tags: input.tags,
      categoryId: input.categoryId,
      defaultLanguage: input.language,
      defaultAudioLanguage: input.language,
    },
    status: {
      privacyStatus: input.privacy,
      selfDeclaredMadeForKids: input.madeForKids,
      containsSyntheticMedia: input.containsSyntheticMedia,
      embeddable: true,
    },
  };
  const size = statSync(input.videoFile).size;
  const init = await check(
    await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        ...auth,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': 'video/mp4',
        'x-upload-content-length': String(size),
      },
      body: JSON.stringify(meta),
    }),
    'yükleme başlatma',
  );
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube yükleme adresi alınamadı');

  // 2) Dosyanın kendisi (video birkaç yüz MB'ı geçmez; tek parça gönderiyoruz)
  const put = await check(
    await fetch(location, {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'video/mp4', 'content-length': String(size) },
      body: readFileSync(input.videoFile),
    }),
    'video yükleme',
  );
  const video = (await put.json()) as { id: string };

  // 3) Kapak (kanalın telefonla doğrulanmış olması gerekir) ve altyazı: hata olursa yükleme yine geçerli
  if (input.thumbnailFile) {
    try {
      await check(
        await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'image/jpeg' },
          body: readFileSync(input.thumbnailFile),
        }),
        'kapak',
      );
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  if (input.srtFile) {
    try {
      const boundary = `yt${Date.now()}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
            JSON.stringify({ snippet: { videoId: video.id, language: input.language, name: 'English' } }) +
            `\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`,
        ),
        readFileSync(input.srtFile),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      await check(
        await fetch('https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', {
          method: 'POST',
          headers: { ...auth, 'content-type': `multipart/related; boundary=${boundary}` },
          body,
        }),
        'altyazı',
      );
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  return { id: video.id, warnings };
}
