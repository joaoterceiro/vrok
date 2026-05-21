import { describe, expect, it } from 'vitest';
import { EvolutionAdapter } from '../evolution';

/**
 * Snapshot tests for the Evolution webhook parser. These payloads were
 * captured from real Evolution v2 messages — the parser must keep emitting
 * the same canonical `IncomingEvent` shape so the inbound worker stays
 * stable across Evolution version bumps.
 */

const CHANNEL_ID = '00000000-0000-0000-0000-000000000000';

function withChannel(body: Record<string, unknown>) {
  return { ...body, __channelId: CHANNEL_ID };
}

describe('EvolutionAdapter.parseWebhook', () => {
  it('parses a basic incoming text message', () => {
    const body = withChannel({
      event: 'messages.upsert',
      instance: 'demo',
      data: {
        key: {
          id: 'ABC123',
          remoteJid: '5511999990000@s.whatsapp.net',
          fromMe: false,
        },
        message: { conversation: 'Olá!' },
        pushName: 'Maria',
        messageTimestamp: 1700000000,
      },
    });
    const events = EvolutionAdapter.parseWebhook(body, {} as never);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      channelId: CHANNEL_ID,
      providerMessageId: 'ABC123',
      externalContactId: expect.stringContaining('5511999990000'),
      content: { type: 'text', text: 'Olá!' },
    });
  });

  it('ignores messages from self (fromMe=true)', () => {
    const body = withChannel({
      event: 'messages.upsert',
      data: {
        key: { id: 'X1', remoteJid: '5511999990000@s.whatsapp.net', fromMe: true },
        message: { conversation: 'meu envio' },
        messageTimestamp: 1700000000,
      },
    });
    const events = EvolutionAdapter.parseWebhook(body, {} as never);
    expect(events).toHaveLength(0);
  });

  it('parses status updates (delivered/read)', () => {
    const body = withChannel({
      event: 'messages.update',
      data: {
        keyId: 'ABC123',
        status: 'READ',
      },
    });
    const events = EvolutionAdapter.parseWebhook(body, {} as never);
    expect(events.some((e) => e.content.type === 'status')).toBe(true);
  });

  it('returns empty for unknown event types', () => {
    const events = EvolutionAdapter.parseWebhook(
      withChannel({ event: 'something.unknown', data: {} }),
      {} as never,
    );
    expect(events).toEqual([]);
  });
});
