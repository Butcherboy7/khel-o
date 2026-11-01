import { NextResponse, type NextRequest } from 'next/server';

/**
 * HTTP basic auth over the whole dev site. Off unless DEV_GATE_USER and
 * DEV_GATE_PASSWORD are set at runtime (dev's .env.dev only; never in git).
 *
 * Once the browser prompt is passed, a cookie (HMAC of the user with the
 * password, same maths as backend app/core/dev_gate.py) lets the app's own
 * /api calls through: those carry the login token in the Authorization
 * header, so they can't also carry basic auth.
 */
const COOKIE = 'khelo_dev_gate';

async function gateCookie(user: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(user));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function basicOk(header: string | null, user: string, password: string): boolean {
  if (!header || !header.toLowerCase().startsWith('basic ')) return false;
  try {
    const [u, ...rest] = atob(header.slice(6).trim()).split(':');
    return u === user && rest.join(':') === password;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const user = process.env.DEV_GATE_USER;
  const password = process.env.DEV_GATE_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const expected = await gateCookie(user, password);
  if (req.cookies.get(COOKIE)?.value === expected) return NextResponse.next();

  if (basicOk(req.headers.get('authorization'), user, password)) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE, expected, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    return res;
  }
  return new NextResponse("This is KHELO's private test site.", {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="KHELO dev", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next's own build files (the page that loads them is gated).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
