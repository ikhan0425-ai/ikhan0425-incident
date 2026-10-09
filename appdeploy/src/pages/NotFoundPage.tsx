import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiGet, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SITE_NAME } from '../shared/constants';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-surface-3">404</p>
      <h1 className="mt-4 text-xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-sm text-muted">삭제되었거나 주소가 잘못되었을 수 있어요.</p>
      <Link to="/" className="btn btn-primary mt-6">
        모델 둘러보기
      </Link>
    </div>
  );
}

// 아래는 상세 페이지들이 함께 쓰는 불러오기 상태 도우미

/** 불러오기 실패 (404 제외). 다시 시도 버튼으로 새로 불러온다 */
export function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="card mx-auto my-12 flex max-w-md flex-col items-center px-6 py-12 text-center" role="alert">
      <h1 className="text-xl font-bold">문제가 생겼어요</h1>
      <p className="mt-2 text-sm text-muted">{errorMessage(error)}</p>
      <button type="button" onClick={onRetry} className="btn btn-primary mt-6">
        다시 시도
      </button>
    </div>
  );
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'not_found';
}

const DEFAULT_TITLE = `${SITE_NAME} - AI 그림 모델 & 이미지 공유`;

/** 브라우저 탭 제목. null 이면 기본 제목 */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

interface Loaded<T> {
  key: string;
  data: T | null;
  error: unknown;
}

/**
 * GET 한 번으로 페이지 데이터를 불러온다. url 이 바뀌면 이전 응답은 버리고 새로 불러온다 (그동안 data 는 null).
 * refreshOnSignIn: 로그인/로그아웃하면 화면은 그대로 둔 채 다시 불러온다 (좋아요 여부 등 보는 사람에 따라 다른 값).
 */
export function usePageData<T>(url: string | null, { refreshOnSignIn = false }: { refreshOnSignIn?: boolean } = {}) {
  const { me, ready } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const key = `${attempt}:${url}`;

  // 처음 로그인 상태 확인이 끝나는 것은 제외 (첫 요청에 이미 로그인 정보가 실려 있다)
  const viewer = ready ? (me?.id ?? '') : null;
  const lastViewer = useRef(viewer);
  useEffect(() => {
    const prev = lastViewer.current;
    lastViewer.current = viewer;
    if (refreshOnSignIn && prev !== null && prev !== viewer) setRefresh((n) => n + 1);
  }, [viewer, refreshOnSignIn]);

  useEffect(() => {
    if (url === null) return;
    let alive = true;
    apiGet<T>(url).then(
      (data) => {
        if (alive) setLoaded({ key, data, error: null });
      },
      (error: unknown) => {
        if (!alive) return;
        // 조용히 다시 불러오다 실패하면 보던 화면을 그대로 둔다
        setLoaded((prev) => (prev?.key === key && prev.data !== null ? prev : { key, data: null, error }));
      },
    );
    return () => {
      alive = false;
    };
  }, [url, key, refresh]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = url !== null && loaded?.key === key ? loaded : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry };
}
