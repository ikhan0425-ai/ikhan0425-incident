import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ImageGallery } from '../components/ImageGallery';
import { ModelResults } from '../components/ModelBrowser';
import { ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCount, formatDate } from '../shared/format';
import type { Profile } from '../shared/types';
import { isNotFound, NotFoundPage, PageError, usePageData, usePageTitle } from './NotFoundPage';

/** 내 프로필에서만 보이는 닉네임 변경 */
function DisplayNameForm({ current }: { current: string }) {
  const { updateDisplayName, signIn } = useAuth();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const name = value.trim();
    if (name.length < 2 || name.length > 20) {
      setMessage({ ok: false, text: '닉네임은 2~20자로 입력해 주세요.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const me = await updateDisplayName(name);
      setValue(me.displayName);
      setMessage({ ok: true, text: '닉네임을 바꿨어요.' });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
      if (err instanceof ApiError && err.code === 'auth_required') void signIn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3 max-w-sm">
      <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="displayName">
        닉네임 변경
      </label>
      <div className="flex gap-2">
        <input
          id="displayName"
          className="input py-1.5"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage(null);
          }}
          maxLength={20}
          placeholder="화면에 보일 이름 (2~20자)"
          autoComplete="nickname"
        />
        <button type="submit" disabled={busy || value.trim() === current} className="btn btn-secondary shrink-0 py-1.5">
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`mt-1.5 text-xs ${message.ok ? 'text-success' : 'text-danger'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

function ProfileContent({ profile, tab }: { profile: Profile; tab: 'models' | 'images' }) {
  const { me } = useAuth();
  const isMe = !!me && me.id === profile.id;
  // 닉네임을 바꾸면 바로 반영되도록 내 프로필은 로그인 정보의 닉네임을 쓴다
  const displayName = isMe ? me.displayName : profile.displayName;
  const base = `/users/${profile.id}`;

  const stats = [
    { label: '모델', value: profile.stats.models },
    { label: '이미지', value: profile.stats.images },
    { label: '받은 다운로드', value: profile.stats.downloads },
    { label: '받은 좋아요', value: profile.stats.likes },
  ];

  return (
    <>
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar userId={profile.id} displayName={displayName} size={72} />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">{displayName}</h1>
            <p className="text-sm text-muted">{formatDate(profile.createdAt)} 가입</p>
            {profile.bio && <p className="mt-2 max-w-xl text-sm text-fg/90">{profile.bio}</p>}
            {isMe && <DisplayNameForm current={me.displayName} />}
          </div>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-center sm:gap-6">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="text-xl font-extrabold">{formatCount(s.value)}</dd>
              <dt className="text-xs text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 flex gap-1.5" role="tablist">
        <Link
          to={base}
          role="tab"
          aria-selected={tab === 'models'}
          className={`chip font-semibold ${tab === 'models' ? 'chip-active' : ''}`}
        >
          모델 {profile.stats.models}
        </Link>
        <Link
          to={`${base}?tab=images`}
          role="tab"
          aria-selected={tab === 'images'}
          className={`chip font-semibold ${tab === 'images' ? 'chip-active' : ''}`}
        >
          이미지 {profile.stats.images}
        </Link>
      </div>

      <div className="mt-5">
        {tab === 'models' ? (
          <ModelResults
            key={`m-${profile.id}`}
            query={new URLSearchParams({ userId: profile.id }).toString()}
            empty={
              <div className="card px-6 py-12 text-center text-sm text-muted">
                아직 올린 모델이 없어요.
                {isMe && (
                  <Link to="/models/new" className="btn btn-primary mx-auto mt-4 flex w-fit">
                    첫 모델 올리기
                  </Link>
                )}
              </div>
            }
          />
        ) : (
          <ImageGallery
            key={`i-${profile.id}`}
            endpoint={`/api/images?${new URLSearchParams({ userId: profile.id }).toString()}`}
            empty={
              <div className="card px-6 py-12 text-center text-sm text-muted">
                아직 올린 이미지가 없어요.
                {isMe && (
                  <Link to="/images/new" className="btn btn-primary mx-auto mt-4 flex w-fit">
                    이미지 올리기
                  </Link>
                )}
              </div>
            }
          />
        )}
      </div>
    </>
  );
}

export function UserPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const { data, error, retry } = usePageData<{ profile: Profile }>(`/api/users/${encodeURIComponent(id)}`);
  const profile = data?.profile ?? null;
  const tab = searchParams.get('tab') === 'images' ? 'images' : 'models';
  const name = profile ? (me?.id === profile.id ? me.displayName : profile.displayName) : null;
  usePageTitle(name ?? (isNotFound(error) ? '사용자를 찾을 수 없어요' : null));

  if (isNotFound(error)) return <NotFoundPage />;
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      {profile ? (
        <ProfileContent key={profile.id} profile={profile} tab={tab} />
      ) : error ? (
        <PageError error={error} onRetry={retry} />
      ) : (
        <div className="skeleton h-32 rounded-xl" />
      )}
    </div>
  );
}
