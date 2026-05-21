import type { ChannelAdapter, ChannelType } from '../channel-types';
import { EvolutionAdapter } from './evolution';
import { WhatsAppCloudAdapter } from './wa-cloud';
import { InstagramAdapter } from './instagram';
import { TelegramAdapter } from './telegram';
import { WebchatAdapter } from './webchat';
import { EmailAdapter } from './email';

const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {
  wa_evolution: EvolutionAdapter,
  wa_cloud: WhatsAppCloudAdapter,
  instagram: InstagramAdapter,
  telegram: TelegramAdapter,
  webchat: WebchatAdapter,
  email: EmailAdapter,
};

export function getAdapter(type: ChannelType): ChannelAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`No adapter registered for channel type '${type}'`);
  }
  return adapter;
}

export function listRegisteredAdapters(): ChannelAdapter[] {
  return Object.values(adapters).filter(Boolean) as ChannelAdapter[];
}
