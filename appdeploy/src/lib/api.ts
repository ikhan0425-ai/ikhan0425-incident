// 백엔드 호출 래퍼. AppDeploy 규칙상 fetch 대신 @appdeploy/client 의 api 만 쓴다.
// 오류 응답은 { error: string, code: string } 형태로 온다.

import { api } from '@appdeploy/client';

export type ApiErrorCode =
  | 'auth_required'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'server_error'
  | 'network';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: ApiErrorCode,
  ) {
    super(message);
  }
}

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 401) return 'auth_required';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'bad_request';
  if (status === 0) return 'network';
  return 'server_error';
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = e as {
    response?: { status?: number; data?: unknown };
    status?: number;
    data?: unknown;
    message?: string;
  };
  const status = err?.response?.status ?? err?.status ?? 0;
  const data = (err?.response?.data ?? err?.data) as { error?: unknown; code?: unknown } | undefined;
  const message =
    data && typeof data === 'object' && typeof data.error === 'string'
      ? data.error
      : status === 0
        ? '네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'
        : status === 429
          ? '요청이 많아요. 잠시 후 다시 시도해 주세요.'
          : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  const code =
    data && typeof data === 'object' && typeof data.code === 'string'
      ? (data.code as ApiErrorCode)
      : codeFromStatus(status);
  return new ApiError(message, status, code);
}

/** 2xx 인데 오류 본문이 오는 경우까지 처리한다 */
function unwrap<T>(res: { data: unknown }): T {
  const data = res?.data as { error?: unknown; code?: unknown } | undefined;
  if (data && typeof data === 'object' && typeof data.error === 'string' && typeof data.code === 'string') {
    const code = data.code as ApiErrorCode;
    const status =
      code === 'auth_required'
        ? 401
        : code === 'forbidden'
          ? 403
          : code === 'not_found'
            ? 404
            : code === 'bad_request'
              ? 400
              : code === 'rate_limited'
                ? 429
                : 500;
    throw new ApiError(data.error, status, code);
  }
  return res.data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  try {
    return unwrap<T>(await api.get(url));
  } catch (e) {
    throw toApiError(e);
  }
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  try {
    return unwrap<T>(await api.post(url, body ?? {}));
  } catch (e) {
    throw toApiError(e);
  }
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  try {
    return unwrap<T>(await api.put(url, body ?? {}));
  } catch (e) {
    throw toApiError(e);
  }
}

export async function apiDelete<T>(url: string): Promise<T> {
  try {
    return unwrap<T>(await api.delete(url));
  } catch (e) {
    throw toApiError(e);
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.';
}
