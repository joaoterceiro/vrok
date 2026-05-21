import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Providers } from '@/components/providers';
import './globals.css';

/**
 * Fonts — SF Pro stack only.
 *
 * SF Pro isn't on Google Fonts (Apple proprietary). We use the OS-native
 * stack: macOS/iOS render real SF Pro, Windows falls back to Segoe UI,
 * Linux to system-ui. No webfont download → instant first paint.
 *
 * The `font-sans` / `font-mono` / `font-display` Tailwind utilities all
 * resolve to SF Pro variants on Apple platforms via `tailwind.config.ts`.
 */

export const metadata: Metadata = {
  title: {
    default: 'Vrok',
    template: '%s · Vrok',
  },
  description: 'Plataforma de atendimento ao cliente multicanal',
  applicationName: 'Vrok',
  formatDetection: { telephone: false },
  icons: {
    icon: '/vrok-icon.svg',
    shortcut: '/vrok-icon.svg',
    apple: '/vrok-icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster
              position="bottom-right"
              theme="dark"
              toastOptions={{
                classNames: {
                  toast:
                    'bg-popover text-popover-foreground border-border shadow-lg rounded-md',
                  title: 'text-sm font-medium',
                  description: 'text-xs text-muted-foreground',
                },
              }}
            />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
