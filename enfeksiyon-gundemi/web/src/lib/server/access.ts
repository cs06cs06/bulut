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

/**
 * aud: Access uygulamasının AUD değeri (virgülle birden çok verilebilir).
 * anyAud: workers.dev adresinde Access, Worker ayarlarından ayrı bir uygulama olarak açılır ve AUD değeri
 * farklıdır. Orada imza ve ekip (issuer) doğrulanır, AUD aranmaz; ekipteki tek Access uygulamaları bu
 * uygulamanın kendi adresleri olduğundan güvenlik düzeyi aynıdır.
 */
export async function verifyAccessJwt(
  token: string | null,
  teamDomain: string,
  aud: string,
  anyAud = false,
): Promise<{ email: string } | null> {
  if (!token) return null;
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const audience = aud.split(',').map((a) => a.trim()).filter(Boolean);
    const { payload } = await jwtVerify(token, jwks, anyAud ? { issuer } : { issuer, audience });
    return { email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}
