// storage 서명 URL 은 15분 뒤 만료된다. 여유를 두고 받은 지 10분이 지나면 새로 받아서 쓴다.

export const SIGNED_URL_MAX_AGE_MS = 10 * 60 * 1000;

/** 'seed/...' 같은 상대 경로는 함께 배포된 정적 파일이라 만료되지 않는다 */
function isStaticPath(url: string): boolean {
  return !/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith('/');
}

/** fetchedAt(ms) 에 받은 url 을 아직 써도 되는지 */
export function isUrlFresh(url: string, fetchedAt: number, now = Date.now()): boolean {
  return isStaticPath(url) || now - fetchedAt < SIGNED_URL_MAX_AGE_MS;
}

/** 새 탭으로 열어도 되는 주소만 (http(s) 또는 같은 사이트 상대 경로). 아니면 null */
export function openableUrl(raw: string): string | null {
  try {
    const u = new URL(raw, window.location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
