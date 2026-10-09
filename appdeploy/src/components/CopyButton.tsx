import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http 환경 등 clipboard API 를 못 쓰는 경우
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({
  text,
  label,
  className = '',
  title,
}: {
  text: string;
  label?: string;
  className?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      title={title ?? '복사'}
      aria-label={title ?? label ?? '복사'}
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(text)) setCopied(true);
      }}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors ${
        copied ? 'text-success' : 'text-muted hover:bg-surface-3 hover:text-fg'
      } ${className}`}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {label && <span>{copied ? '복사됨' : label}</span>}
    </button>
  );
}
