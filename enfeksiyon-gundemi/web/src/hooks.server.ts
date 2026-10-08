import type { Handle } from '@sveltejs/kit';
import { isConfigured, verifyAccessJwt } from '$lib/server/access';

export const handle: Handle = async ({ event, resolve }) => {
  const env = event.platform?.env;
  const team = env?.ACCESS_TEAM_DOMAIN;
  const aud = env?.ACCESS_AUD;
  event.locals.userEmail = null;
  event.locals.accessConfigured = isConfigured(team) && isConfigured(aud);

  if (event.locals.accessConfigured) {
    const user = await verifyAccessJwt(event.request.headers.get('cf-access-jwt-assertion'), team!, aud!);
    if (!user) {
      return new Response('Bu sayfaya erişim için giriş yapmanız gerekiyor.', {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    event.locals.userEmail = user.email;
  }

  const response = await resolve(event);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
};
