export function FormPage({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {desc && <p className="mt-1.5 text-sm text-muted">{desc}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-64 rounded-xl" />
      <div className="skeleton h-48 rounded-xl" />
    </div>
  );
}
