// ffmpeg / ffprobe yardımcıları (sistemde kurulu olmalı: GitHub Actions'ta apt ile kurulur).

import { spawn } from 'node:child_process';

export function run(cmd: string, args: string[], opts: { input?: NodeJS.ReadableStream } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`${cmd} çalıştırılamadı: ${e.message}`)));
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} hata verdi (${code}):\n${err.slice(-2000)}`)),
    );
    if (opts.input) opts.input.pipe(p.stdin);
    else p.stdin.end();
  });
}

export const ffmpeg = (args: string[]) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function probeDuration(file: string): Promise<number> {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`Süre okunamadı: ${file}`);
  return d;
}

/** Kare akışını (JPEG) ffmpeg'e yazan kodlayıcı. */
export function frameEncoder(output: string, fps: number) {
  const p = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-movflags', '+faststart',
      output,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  const done = new Promise<void>((resolve, reject) => {
    p.on('error', (e) => reject(new Error(`ffmpeg çalıştırılamadı: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg kodlama hatası (${code}): ${err.slice(-1500)}`))));
  });
  return {
    async write(frame: Buffer) {
      if (!p.stdin.write(frame)) await new Promise((r) => p.stdin.once('drain', r));
    },
    async end() {
      p.stdin.end();
      await done;
    },
  };
}
