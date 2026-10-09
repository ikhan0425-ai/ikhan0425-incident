// 기간별(일간/주간/월간/연간) 집계용 카운터. 날짜는 한국 시간 기준.

import type { Period } from '../shared/constants';
import type { SeedStat } from './seed-types';

export const DAY = 24 * 60 * 60 * 1000;
const KST = 9 * 60 * 60 * 1000;

/** 'YYYYMMDD' */
export function dayKey(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10).replace(/-/g, '');
}

/** 'YYYYMM' */
export function monthKey(ms: number): string {
  return dayKey(ms).slice(0, 6);
}

/** 최근 n개월의 월 키 (이번 달 포함) */
function recentMonthKeys(now: number, n: number): string[] {
  const d = new Date(now + KST);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    keys.push(`${y}${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return keys;
}

/** t: 전체, d: 일별(최근 31일), m: 월별(최근 13개월) */
export interface Counter {
  t: number;
  d: Record<string, number>;
  m: Record<string, number>;
}

export function emptyCounter(): Counter {
  return { t: 0, d: {}, m: {} };
}

/** 오래된 일별(31일)·월별(13개월) 칸을 지운다 */
export function pruneCounter(c: Counter, now = Date.now()): void {
  const oldestDay = dayKey(now - 31 * DAY);
  for (const k of Object.keys(c.d)) if (k < oldestDay || c.d[k] <= 0) delete c.d[k];
  const months = new Set(recentMonthKeys(now, 13));
  for (const k of Object.keys(c.m)) if (!months.has(k) || c.m[k] <= 0) delete c.m[k];
}

/** 이벤트 1건 추가(+1) 또는 취소(-1). at 은 이벤트가 일어난 시각 */
export function bump(c: Counter, at: number, delta: 1 | -1, now = Date.now()): void {
  c.t = Math.max(0, c.t + delta);
  const dk = dayKey(at);
  const mk = monthKey(at);
  c.d[dk] = (c.d[dk] ?? 0) + delta;
  c.m[mk] = (c.m[mk] ?? 0) + delta;
  pruneCounter(c, now);
}

/** 오늘(한국 시간) 0시부터 지금까지 지난 비율 (0~1) */
function dayElapsed(now: number): number {
  const kst = now + KST;
  return (kst % DAY) / DAY;
}

/**
 * 기간 안의 이벤트 수. 일·월 단위 칸만 있으므로 "최근 24시간/7일/365일"을 근사한다:
 * 가장 오래된 칸은 아직 기간에 걸쳐 있는 비율만큼만 센다 (자정에 순위가 갑자기 비지 않게).
 */
export function counterInPeriod(c: Counter | undefined, period: Period, now: number): number {
  if (!c) return 0;
  if (period === 'all') return c.t;
  if (period === 'year') {
    const keys = recentMonthKeys(now, 13);
    const d = new Date(now + KST);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const monthElapsed = (d.getUTCDate() - 1 + dayElapsed(now)) / daysInMonth;
    return keys.slice(0, 12).reduce((s, k) => s + (c.m[k] ?? 0), 0) + (c.m[keys[12]] ?? 0) * (1 - monthElapsed);
  }
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  let s = 0;
  for (let i = 0; i < days; i++) s += c.d[dayKey(now - i * DAY)] ?? 0;
  s += (c.d[dayKey(now - days * DAY)] ?? 0) * (1 - dayElapsed(now));
  return s;
}

/** 샘플 데이터 통계 (며칠 전 / 몇 달 전 기준) */
export function seedInPeriod(s: SeedStat | undefined, period: Period): number {
  if (!s) return 0;
  const sum = (rec: Record<string, number>, n: number) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += rec[String(i)] ?? 0;
    return t;
  };
  switch (period) {
    case 'all':
      return s.total;
    case 'year':
      return sum(s.months, 12);
    case 'month':
      return sum(s.days, 30);
    case 'week':
      return sum(s.days, 7);
    case 'day':
      return sum(s.days, 1);
  }
}
