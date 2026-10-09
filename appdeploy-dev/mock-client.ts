// 로컬 테스트용 @appdeploy/client 모의 구현. 로그인은 이름을 묻는 prompt 로 대신한다.

const TOKEN_KEY = 'mock_appdeploy_token';

function token(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request(method: string, url: string, data?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(data ?? {}) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // text
  }
  if (!res.ok) throw Object.assign(new Error(`Request failed with status code ${res.status}`), { response: { status: res.status, data: body } });
  return { data: body };
}

export const api = {
  get: (url: string) => request('GET', url),
  post: (url: string, data?: unknown) => request('POST', url, data),
  put: (url: string, data?: unknown) => request('PUT', url, data),
  delete: (url: string) => request('DELETE', url),
};

function parse(t: string | null) {
  if (!t) return null;
  try {
    const json = atob(t.slice('mock.'.length).replace(/-/g, '+').replace(/_/g, '/'));
    const u = JSON.parse(decodeURIComponent(escape(json)));
    return { userId: u.userId as string, name: u.name as string, email: u.email as string, scope: 'openid email profile' };
  } catch {
    return null;
  }
}

function encode(obj: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const auth = {
  async signIn() {
    const name = window.prompt('모의 로그인: 이름을 입력하세요 (로컬 테스트용)', '테스터');
    if (!name) throw Object.assign(new Error('closed'), { code: 'popup_closed' });
    const userId = `00000000-0000-4000-8000-${Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(12, '0').slice(-12)}`;
    const t = `mock.${encode({ userId, name, email: `${userId.slice(-6)}@example.com` })}`;
    localStorage.setItem(TOKEN_KEY, t);
    return { user: parse(t)!, accessToken: t, expiresIn: 900 };
  },
  async getUser() {
    return parse(token());
  },
  async getAccessToken() {
    return token();
  },
  async signOut() {
    localStorage.removeItem(TOKEN_KEY);
  },
  isSignedIn() {
    return parse(token()) !== null;
  },
};
