// 응답·오류 헬퍼. 오류 본문은 항상 { error, code } (프론트엔드 src/lib/api.ts 가 이 형태를 읽는다).

import { auth, json, type AuthUser, type RouterContext, type RouterResponse } from '@appdeploy/sdk';

export type ErrorCode = 'auth_required' | 'forbidden' | 'not_found' | 'bad_request' | 'rate_limited' | 'server_error';

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: ErrorCode = 'bad_request',
  ) {
    super(message);
  }
}

export const notFound = (what = '찾을 수 없어요.') => new AppError(what, 404, 'not_found');
export const forbidden = (what = '권한이 없어요.') => new AppError(what, 403, 'forbidden');
export const badRequest = (what: string) => new AppError(what, 400, 'bad_request');

export function fail(message: string, status: number, code: ErrorCode): RouterResponse {
  return json({ error: message, code }, status);
}

type Handler = (ctx: RouterContext) => Promise<RouterResponse>;

function isQuotaError(e: unknown): boolean {
  const x = e as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown } | null;
  if (!x || typeof x !== 'object') return false;
  return (
    x.status === 429 ||
    x.statusCode === 429 ||
    x.name === 'AppDatabaseQuotaExceeded' ||
    x.code === 'AppDatabaseQuotaExceeded' ||
    (typeof x.message === 'string' && /AppDatabaseQuotaExceeded|quota/i.test(x.message))
  );
}

/** 예외를 JSON 오류 응답으로 바꾼다 */
export function handle(fn: Handler): Handler {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof AppError) return fail(e.message, e.status, e.code);
      if (isQuotaError(e)) {
        // DB 사용량 한도: 숨기거나 재시도하지 않고 그대로 알린다
        console.warn('[api] quota exceeded', e);
        return fail('요청이 많아 잠시 처리할 수 없어요. 잠시 후 다시 시도해 주세요.', 429, 'rate_limited');
      }
      console.error('[api] unexpected error', e);
      return fail('서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 500, 'server_error');
    }
  };
}

/** 로그인하지 않아도 되는 요청에서 현재 사용자 (없으면 null) */
export async function optionalUser(ctx: RouterContext): Promise<AuthUser | null> {
  if (ctx.user) return ctx.user;
  try {
    return await auth.getUser(ctx.event);
  } catch {
    return null;
  }
}

/** requireAuth() 미들웨어 뒤에서만 쓴다 */
export function userOf(ctx: RouterContext): AuthUser {
  if (!ctx.user) throw new AppError('로그인이 필요해요.', 401, 'auth_required');
  return ctx.user;
}

export function bodyOf(ctx: RouterContext): Record<string, unknown> {
  const b = ctx.body;
  if (typeof b === 'string') {
    try {
      const parsed: unknown = JSON.parse(b);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // 아래에서 처리
    }
    throw badRequest('요청 형식이 올바르지 않아요.');
  }
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}
