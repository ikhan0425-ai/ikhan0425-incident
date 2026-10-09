const COLORS = ["#5c7cfa", "#7950f2", "#be4bdb", "#e64980", "#f76707", "#f59f00", "#37b24d", "#1098ad", "#1c7ed6"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ username, displayName, size = 24 }: { username: string; displayName: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, background: COLORS[hash(username) % COLORS.length] }}
      aria-hidden="true"
    >
      {Array.from(displayName || username)[0]?.toUpperCase()}
    </span>
  );
}
