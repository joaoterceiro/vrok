/**
 * Custom Node server combining Next.js + Socket.IO.
 *
 * Socket.IO needs persistent WebSockets, which Next.js Edge runtime does not
 * provide. The custom server wires:
 *   - Next.js request handler
 *   - Socket.IO server with @socket.io/redis-adapter for horizontal scaling
 *   - A Redis subscriber that listens on `zora:socket` and forwards messages
 *     from workers (BullMQ) to the right rooms (conversation:X, user:Y, team:Z).
 */
import { createServer, type IncomingMessage } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server as IOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { REDIS_CHANNELS, SOCKET_ROOMS } from '@zora/shared';
import { decode } from 'next-auth/jwt';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url ?? '/', true);
  void handle(req, res, parsedUrl);
});

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error('REDIS_URL is not set');

const pub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const sub = pub.duplicate();
const backplane = pub.duplicate();

const io = new IOServer(httpServer, {
  path: '/socket.io',
  cors: { origin: process.env.APP_URL ?? '*', credentials: true },
  transports: ['websocket', 'polling'],
});

io.adapter(createAdapter(pub, sub));

// ---- Auth middleware -------------------------------------------------------
// Pull the NextAuth session token from the cookie sent on the WS handshake.
// Reject connections without a valid token. Attach the user id/role to the
// socket so room-ACL checks can use them.
const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';
const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

function readSessionCookie(req: IncomingMessage): string | null {
  const header = req.headers.cookie ?? '';
  for (const name of SESSION_COOKIE_NAMES) {
    const m = header.match(new RegExp(`(?:^|; )${name.replace(/[.[\]/$()*+?^|\\]/g, '\\$&')}=([^;]+)`));
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

interface SocketAuth {
  userId: string;
  role: 'admin' | 'supervisor' | 'agent';
}

io.use(async (socket, nextFn) => {
  if (!AUTH_SECRET) {
    return nextFn(new Error('server misconfigured: AUTH_SECRET missing'));
  }
  try {
    const token = readSessionCookie(socket.request);
    if (!token) return nextFn(new Error('no session'));
    const payload = await decode({ token, secret: AUTH_SECRET, salt: 'authjs.session-token' });
    if (!payload?.uid) return nextFn(new Error('invalid session'));
    (socket.data as { auth?: SocketAuth }).auth = {
      userId: String(payload.uid),
      role: (payload.role as SocketAuth['role']) ?? 'agent',
    };
    nextFn();
  } catch (err) {
    nextFn(new Error(`auth failed: ${(err as Error).message}`));
  }
});

// ---- Room ACL --------------------------------------------------------------
// Whitelist patterns the connected user can subscribe to. Conversation/team
// access is enforced loosely here (any authed user); finer-grained checks
// live in the REST API responses already protecting the data.
const SAFE_ROOM = /^(?:all|user:[^:]{1,80}|team:[a-f0-9-]{8,80}|conversation:[a-f0-9-]{8,80}|webchat:[a-z0-9-]{2,80}:[a-z0-9-]{2,80}|campaign:[a-f0-9-]{8,80})$/i;

function canJoin(socket: Socket, room: string): boolean {
  const auth = (socket.data as { auth?: SocketAuth }).auth;
  if (!auth) return false;
  if (typeof room !== 'string' || room.length === 0 || room.length > 160) return false;
  if (!SAFE_ROOM.test(room)) return false;
  // `user:<id>` rooms are private — must match the authed user.
  if (room.startsWith('user:')) {
    return room === `user:${auth.userId}`;
  }
  return true;
}

io.on('connection', (socket) => {
  // Every authed socket automatically joins their own user room so workers
  // can target notifications without the client having to subscribe.
  const auth = (socket.data as { auth?: SocketAuth }).auth;
  if (auth) void socket.join(`user:${auth.userId}`);

  socket.on('join', (room: string) => {
    if (canJoin(socket, room)) void socket.join(room);
    else socket.emit('error', { code: 'forbidden', room });
  });
  socket.on('leave', (room: string) => {
    void socket.leave(room);
  });

  // Typing relay — broadcast to the conversation room, excluding the sender,
  // so other operators viewing the same conversation see "digitando…".
  // We only relay when the sender is actually in the room (= has access).
  for (const event of ['typing:start', 'typing:stop'] as const) {
    socket.on(event, (payload: { conversationId?: string }) => {
      const convId = payload?.conversationId;
      if (!convId) return;
      const room = `conversation:${convId}`;
      if (!socket.rooms.has(room)) return; // not joined → silently drop
      socket.to(room).emit(event, {
        conversationId: convId,
        userId: auth?.userId,
      });
    });
  }
});

// Backplane: workers publish socket events here; we relay to the right rooms.
backplane.subscribe(REDIS_CHANNELS.socketBroadcast, (err) => {
  if (err) {
    console.error('[socket] failed to subscribe to broadcast channel', err);
    process.exit(1);
  }
});
backplane.on('message', (channel, raw) => {
  if (channel !== REDIS_CHANNELS.socketBroadcast) return;
  try {
    const parsed = JSON.parse(raw) as { room: string; event: string; data: unknown };
    io.to(parsed.room).emit(parsed.event, parsed.data);
  } catch (err) {
    console.error('[socket] bad broadcast payload', err);
  }
});

httpServer.once('error', (err) => {
  console.error(err);
  process.exit(1);
});

httpServer.listen(port, hostname, () => {
  console.log(`> Vrok ready on http://${hostname}:${port}`);
});

const shutdown = async (signal: string) => {
  console.log(`> ${signal} received, shutting down`);
  io.close();
  httpServer.close();
  await Promise.allSettled([pub.quit(), sub.quit(), backplane.quit()]);
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Mark room names as used to keep the import for downstream callers.
void SOCKET_ROOMS;
