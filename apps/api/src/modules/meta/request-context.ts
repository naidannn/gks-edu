import type { Request } from 'express';
import { normalizeIp } from './meta-user-data.js';

/**
 * The two things Meta wants about the browser a server event came from. Both
 * are required for a `website` event to be attributable at all — without them
 * the event is accepted and then matched to nobody.
 */
export interface MetaRequestContext {
  clientIpAddress?: string;
  clientUserAgent?: string;
}

/**
 * Reads the visitor's address through nginx.
 *
 * `X-Real-IP` is what `deploy/nginx.sh` *sets* (`proxy_set_header X-Real-IP
 * $remote_addr`), so it is the one header a caller cannot forge: nginx
 * overwrites whatever arrived. `X-Forwarded-For` is *appended* to, which means
 * a client can prepend anything it likes and only the last entry — the one
 * nginx added — is trustworthy. `req.ip` is last because, with `trust proxy`
 * off, in production it is nginx's own loopback address.
 */
export function metaRequestContext(request: Request | undefined): MetaRequestContext {
  if (!request) return {};

  const realIp = header(request, 'x-real-ip');
  const forwarded = header(request, 'x-forwarded-for');
  const lastHop = forwarded?.split(',').at(-1)?.trim();

  return {
    clientIpAddress: normalizeIp(realIp ?? lastHop ?? request.ip ?? request.socket?.remoteAddress),
    clientUserAgent: header(request, 'user-agent')?.slice(0, 500),
  };
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}
