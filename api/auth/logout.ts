/**
 * Logout: clear session cookie. POST or GET.
 */
export async function GET(): Promise<Response> {
  const res = Response.json({ ok: true });
  const newHeaders = new Headers(res.headers);
  newHeaders.set(
    'Set-Cookie',
    'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );
  return new Response(res.body, { status: res.status, headers: newHeaders });
}

export async function POST(): Promise<Response> {
  return GET();
}
