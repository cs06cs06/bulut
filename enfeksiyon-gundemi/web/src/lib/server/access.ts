// Cloudflare Access imza doğrulaması (ikinci güvenlik katmanı).
// Access, uygulamanın önünde e-posta koduyla giriş ister ve her isteğe imzalı bir
// jeton (Cf-Access-Jwt-Assertion) ekler. Burada o jetonun gerçekten bizim Access
// uygulamamızdan geldiğini doğruluyoruz; böylece Access'in kapsamadığı bir adres
// (ör. önizleme dağıtımı) üzerinden veriye erişilemez.

import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Yer tutucu veya boş değerler "yapılandırılmamış" sayılır. */
export function isConfigured(v: string | undefined): v is string {
  return !!v && !v.startsWith('__');
}

export async function verifyAccessJwt(
  token: string | null,
  teamDomain: string,
  aud: string,
): Promise<{ email: string } | null> {
  if (!token) return null;
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
    return { email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}
