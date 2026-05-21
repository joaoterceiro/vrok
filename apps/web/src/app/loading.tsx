/**
 * App-level loading state — renders during navigation suspensions. Keeps
 * the 3-pane skeleton structure of the inbox so the layout doesn't jump
 * when content arrives. No spinner, no centered loader — just structural
 * placeholders that match the destination shape.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh bg-background">
      {/* Left rail */}
      <aside className="hidden w-[60px] border-r border-border bg-surface md:block" />

      {/* Conversation list skeleton */}
      <section className="hidden w-full max-w-[360px] border-r border-border bg-surface px-3 py-3 md:block">
        <div className="mb-3 h-5 w-24 animate-pulse rounded bg-surface-2" />
        <div className="mb-3 h-9 w-full animate-pulse rounded-md bg-surface-2" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-3 animate-pulse rounded bg-surface-2"
                  style={{ width: `${50 + (i * 7) % 40}%` }}
                />
                <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Thread skeleton */}
      <section className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
          <div className="space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
            <div className="h-2.5 w-48 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 px-5 py-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-10 animate-pulse rounded-2xl bg-surface-2 ${
                i % 2 === 0 ? 'max-w-[55%] self-start rounded-bl-md' : 'max-w-[50%] self-end rounded-br-md'
              }`}
            />
          ))}
        </div>
        <div className="border-t border-border bg-surface px-5 py-3">
          <div className="h-10 w-full animate-pulse rounded-md bg-surface-2" />
        </div>
      </section>
    </div>
  );
}
