const compact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
});
const shortDateFmt = new Intl.DateTimeFormat('ko-KR', {
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Seoul',
});

/** 1234 → "1.2천", 12345 → "1.2만" */
export function formatCount(n: number): string {
  return n < 1000 ? String(n) : compact.format(n);
}

export function formatDate(ms: number): string {
  return dateFmt.format(new Date(ms));
}

export function formatShortDate(ms: number): string {
  return shortDateFmt.format(new Date(ms));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Civitai 의 AutoV2 해시 (SHA256 앞 10자리) */
export function autoV2(sha256: string | null | undefined): string | null {
  return sha256 ? sha256.slice(0, 10).toUpperCase() : null;
}
