'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';

let singleton: Socket | null = null;

/**
 * Shared Socket.IO client across the SPA. Connects once, multiplexes events.
 * Components subscribe to specific events via `useSocketEvent` below.
 */
export function getSocket(): Socket {
  if (singleton) return singleton;
  singleton = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelayMax: 5_000,
  });
  return singleton;
}

export function useSocket(): Socket {
  const [s] = React.useState(() => getSocket());
  return s;
}

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
  deps: React.DependencyList = [],
) {
  const socket = useSocket();
  React.useEffect(() => {
    const fn = (data: T) => handler(data);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, socket, ...deps]);
}

export function useSocketRoom(room: string | null | undefined) {
  const socket = useSocket();
  React.useEffect(() => {
    if (!room) return;
    socket.emit('join', room);
    return () => {
      socket.emit('leave', room);
    };
  }, [room, socket]);
}

/**
 * Connection status of the singleton socket. Powers the tiny status dot
 * in the rail and lets components show "Reconectando…" banners when needed.
 */
export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

export function useSocketStatus(): SocketStatus {
  const socket = useSocket();
  const [status, setStatus] = React.useState<SocketStatus>(
    socket.connected ? 'connected' : 'connecting',
  );
  React.useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onReconnectAttempt = () => setStatus('connecting');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect_failed', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect_failed', onDisconnect);
    };
  }, [socket]);
  return status;
}
