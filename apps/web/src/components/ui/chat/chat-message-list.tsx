'use client';

import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ChatMessageListProps extends React.HTMLAttributes<HTMLDivElement> {
  smooth?: boolean;
}

/**
 * Scrollable container that auto-sticks to the bottom when new children are
 * appended, unless the user has scrolled up — in which case it shows a
 * "back to bottom" button.
 */
export const ChatMessageList = React.forwardRef<HTMLDivElement, ChatMessageListProps>(
  ({ className, children, smooth = false, ...props }, ref) => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    React.useImperativeHandle(ref, () => scrollRef.current as HTMLDivElement);

    const [isAtBottom, setIsAtBottom] = React.useState(true);
    const [hasNewMessages, setHasNewMessages] = React.useState(false);

    const checkAtBottom = React.useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setIsAtBottom(atBottom);
      if (atBottom) setHasNewMessages(false);
    }, []);

    const scrollToBottom = React.useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      setHasNewMessages(false);
    }, [smooth]);

    React.useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const observer = new MutationObserver(() => {
        if (isAtBottom) {
          scrollToBottom();
        } else {
          setHasNewMessages(true);
        }
      });
      observer.observe(el, { childList: true, subtree: true });
      scrollToBottom();
      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={checkAtBottom}
          className={cn(
            'flex h-full flex-col gap-1 overflow-y-auto scroll-smooth px-3 py-4 md:px-6',
            className,
          )}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          {...props}
        >
          {children}
        </div>
        {!isAtBottom && (
          <Button
            size="icon"
            variant="secondary"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-3 h-9 w-9 rounded-full shadow-lg animate-fade-in"
            aria-label="Voltar ao final"
          >
            <ArrowDown className="h-4 w-4" />
            {hasNewMessages && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
            )}
          </Button>
        )}
      </div>
    );
  },
);
ChatMessageList.displayName = 'ChatMessageList';
