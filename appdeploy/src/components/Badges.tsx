import { modelTypeInfo } from '../shared/constants';

export function TypeBadge({ type, className = '' }: { type: string; className?: string }) {
  const info = modelTypeInfo(type);
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm ${className}`}
      style={{ background: info.color }}
    >
      {info.label}
    </span>
  );
}

export function BaseBadge({ base, className = '' }: { base: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur ${className}`}
    >
      {base}
    </span>
  );
}

export function NsfwBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white ${className}`}>
      19+
    </span>
  );
}
