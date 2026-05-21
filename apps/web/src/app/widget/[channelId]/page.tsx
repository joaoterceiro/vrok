import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db, channels } from '@zora/db';
import { getWebchatTheme } from '@zora/shared/channels';
import { WidgetClient } from './_client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{ channelId: string }>;
}

export default async function WidgetPage({ params }: PageProps) {
  const { channelId } = await params;
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel || channel.type !== 'webchat') notFound();

  const theme = getWebchatTheme(channel.config);

  return (
    <div className="fixed inset-0 bg-background text-foreground">
      <WidgetClient channelId={channelId} greeting={theme.greeting} primary={theme.primary} />
    </div>
  );
}
