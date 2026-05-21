import type { ReactNode } from 'react';

// Widget is its own document; do not inherit the app layout (no auth shell).
export default function WidgetLayout({ children }: { children: ReactNode }) {
  return children;
}
