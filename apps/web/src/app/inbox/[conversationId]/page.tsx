import { ConversationPageClient } from './_client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  return <ConversationPageClient conversationId={conversationId} />;
}
