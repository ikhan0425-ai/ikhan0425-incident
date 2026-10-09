import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, errorMessage } from '../lib/api';
import { TrashIcon } from './icons';

export function DeleteButton({
  endpoint,
  confirmText,
  redirectTo,
  label = '삭제',
}: {
  endpoint: string;
  confirmText: string;
  redirectTo: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="btn btn-danger"
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        try {
          await apiDelete<{ ok: true }>(endpoint);
          navigate(redirectTo);
        } catch (e) {
          window.alert(errorMessage(e));
          setBusy(false);
        }
      }}
    >
      <TrashIcon size={15} /> {busy ? '삭제 중…' : label}
    </button>
  );
}
