import type { ReactNode } from 'react';

export default function InboxLayout({ children }: { children: ReactNode }) {
  // The AppShell that wraps inbox views is rendered inside each page so it can
  // decide what to put in the `thread` / `details` slots based on whether a
  // conversation is selected. Keeping this layout minimal preserves SSR.
  return children;
}
