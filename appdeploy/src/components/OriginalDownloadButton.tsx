import { useState, type ReactNode } from 'react';
import { apiGet, errorMessage } from '../lib/api';
import { isUrlFresh, openableUrl } from '../lib/signed-url';
import type { ImageDetailData } from '../shared/types';

/** <a href download target="_blank"> 를 누른 것과 똑같이 연다 (클릭 처리 안에서 바로 불러야 팝업 차단을 피한다) */
function openOriginal(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 원본 받기. 서명 URL 은 만료되므로 받은 지 오래됐으면 상세 정보를 다시 불러와 새 URL 로 연다.
 * 팝업 차단을 피하려고 클릭하자마자 빈 탭을 먼저 열고, 새 URL 을 받으면 그 탭을 이동시킨다.
 */
export function OriginalDownloadButton({
  imageId,
  url,
  fetchedAt,
  className = '',
  children,
}: {
  imageId: string;
  url: string;
  /** url 을 받은 시각 (ms) */
  fetchedAt: number;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  // 버튼에서 새로 받은 URL (부모가 더 새 값을 주면 그쪽을 쓴다)
  const [renewed, setRenewed] = useState<{ url: string; fetchedAt: number } | null>(null);
  const current = renewed && renewed.fetchedAt > fetchedAt ? renewed : { url, fetchedAt };

  const download = async () => {
    if (busy) return;
    if (isUrlFresh(current.url, current.fetchedAt)) {
      const safe = openableUrl(current.url);
      if (safe) {
        openOriginal(safe);
        return;
      }
    }
    setBusy(true);
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const startedAt = Date.now();
    try {
      const { image } = await apiGet<{ image: ImageDetailData }>(`/api/images/${encodeURIComponent(imageId)}`);
      const safe = openableUrl(image.url);
      if (!safe) throw new Error('원본 주소가 올바르지 않아요.');
      setRenewed({ url: image.url, fetchedAt: startedAt });
      if (tab) tab.location.replace(safe);
      else window.open(safe, '_blank', 'noopener');
    } catch (e) {
      tab?.close();
      window.alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={download} disabled={busy} aria-busy={busy} className={className}>
      {children}
    </button>
  );
}
