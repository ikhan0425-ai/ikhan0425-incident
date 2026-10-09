// 로그인 상태. AppDeploy 로그인 팝업(구글/애플/X/이메일)을 쓰고, 닉네임 등 프로필은 /api/me 에서 받는다.

import { auth } from '@appdeploy/client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Me } from '../shared/types';
import { apiGet, apiPut } from './api';

interface AuthState {
  /** 로그인한 사용자 (닉네임 포함). 로그아웃 상태면 null */
  me: Me | null;
  /** 처음 로그인 상태 확인이 끝났는지 */
  ready: boolean;
  /** 팝업이 막혔을 때 등 사용자에게 보여 줄 메시지 */
  notice: string | null;
  clearNotice: () => void;
  signIn: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  /** 로그인되어 있으면 그대로, 아니면 로그인 팝업을 띄운다 */
  requireSignIn: () => Promise<Me | null>;
  updateDisplayName: (displayName: string) => Promise<Me>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadMe(): Promise<Me | null> {
  try {
    return (await apiGet<{ me: Me }>('/api/me')).me;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const user = auth.isSignedIn() ? await auth.getUser() : null;
        const profile = user ? await loadMe() : null;
        if (alive) setMe(profile);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    try {
      await auth.signIn();
      const profile = await loadMe();
      setMe(profile);
      return profile;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'popup_blocked') setNotice('브라우저가 로그인 팝업을 막았어요. 팝업을 허용한 뒤 다시 시도해 주세요.');
      else if (code !== 'popup_closed') setNotice('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setMe(null);
  }, []);

  const requireSignIn = useCallback(async () => me ?? (await signIn()), [me, signIn]);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const res = await apiPut<{ me: Me }>('/api/me', { displayName });
    setMe(res.me);
    return res.me;
  }, []);

  const value = useMemo(
    () => ({ me, ready, notice, clearNotice: () => setNotice(null), signIn, signOut, requireSignIn, updateDisplayName }),
    [me, ready, notice, signIn, signOut, requireSignIn, updateDisplayName],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
