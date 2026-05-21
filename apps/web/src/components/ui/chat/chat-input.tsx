'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChatInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Max content height in px before scroll (defaults to 200). */
  maxHeight?: number;
}

/**
 * Auto-growing textarea. Submits on Enter (without Shift) — Shift+Enter for
 * newline. Designed to plug into a Composer with surrounding action buttons.
 */
export const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  ({ className, onKeyDown, maxHeight = 200, onChange, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);
    React.useImperativeHandle(ref, () => internalRef.current as HTMLTextAreaElement);

    const resize = React.useCallback(() => {
      const el = internalRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [maxHeight]);

    React.useEffect(() => {
      resize();
    }, [resize, props.value]);

    return (
      <textarea
        ref={internalRef}
        rows={1}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          // Allow parent to preventDefault.
        }}
        className={cn(
          // The Composer wrapper handles the focus ring (focus-within:ring-*).
          // Reset BOTH the focus ring AND its offset here so the global
          // `:focus-visible` rule (ring-offset-background = shark-950)
          // doesn't paint a black halo around the textarea inside the card.
          'block w-full resize-none border-0 bg-transparent px-0 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
ChatInput.displayName = 'ChatInput';
