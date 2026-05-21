import { MessagesSquare } from 'lucide-react';
import { InboxShell } from './_components/inbox-shell';

export const dynamic = 'force-dynamic';

export default function InboxIndexPage() {
  return (
    <InboxShell
      thread={
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="rounded-full bg-surface-2 p-4 text-muted-foreground">
            <MessagesSquare className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold">Selecione uma conversa</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Escolha uma conversa à esquerda para começar a atender. Mensagens novas chegam em tempo real.
          </p>
        </div>
      }
      hasOpenConversation={false}
    />
  );
}
