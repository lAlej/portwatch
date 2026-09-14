import { io, type Socket } from 'socket.io-client';
import { useConnection } from './connection';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => useConnection.getState().setConnected(true));
    socket.on('disconnect', () => useConnection.getState().setConnected(false));
    socket.on('connect_error', () => useConnection.getState().setConnected(false));
  }
  return socket;
}

export function closeSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useConnection.getState().setConnected(false);
}