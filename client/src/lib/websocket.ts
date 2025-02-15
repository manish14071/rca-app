import { create } from 'zustand';

interface WebSocketStore {
  socket: WebSocket | null;
  isConnecting: boolean;
  connect: (userId: number) => void;
  disconnect: () => void;
  sendTyping: (receiverId: number) => void;
  sendPresence: (online: boolean) => void;
}

export const useWebSocket = create<WebSocketStore>((set, get) => ({
  socket: null,
  isConnecting: false,

  connect: (userId: number) => {
    const { socket, isConnecting } = get();

    if (isConnecting) return;
    if (socket) socket.close();

    set({ isConnecting: true });

    const reconnect = (retryCount = 0) => {
      const maxRetries = 5;
      const baseDelay = 1000;

      if (retryCount >= maxRetries) {
        console.error('Max WebSocket reconnection attempts reached');
        set({ isConnecting: false });
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        set({ socket: ws, isConnecting: false });
        
        // Send initial presence and auth
        ws.send(JSON.stringify({
          type: 'auth',
          payload: { userId }
        }));
        get().sendPresence(true);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected: ${event.reason}`);
        set({ socket: null });
        get().sendPresence(false);

        if (event.code !== 1000) {
          const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
          setTimeout(() => reconnect(retryCount + 1), delay);
        } else {
          set({ isConnecting: false });
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const queryClient = (window as any).queryClient;

          switch (data.type) {
            case 'newMessage':
              queryClient.invalidateQueries({ 
                queryKey: ['/api/messages', data.payload.senderId] 
              });
              queryClient.invalidateQueries({ 
                queryKey: ['/api/messages', data.payload.receiverId] 
              });
              break;

            case 'typing':
              console.log('[WebSocket] Typing from:', data.payload.userId);
              break;

            case 'userStatus':
              console.log('[WebSocket] Presence update:', data.payload);
              queryClient.setQueryData(['/api/users'], (old: any[]) => 
                old.map(user => 
                  user.id === data.payload.userId
                    ? { ...user, online: data.payload.online }
                    : user
                )
              );
              break;

            case 'userPresence':
              queryClient.setQueryData(['/api/users', data.payload.userId], 
                (old: any) => ({ ...old, ...data.payload })
              );
              break;

            case 'error':
              console.error('[WebSocket] Server error:', data.payload.message);
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Message error:', error);
        }
      };
    };

    reconnect();
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close(1000, 'User initiated disconnect');
      set({ socket: null, isConnecting: false });
      get().sendPresence(false);
    }
  },

  sendTyping: (receiverId: number) => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'typing',
        payload: { receiverId }
      }));
    }
  },

  sendPresence: (online: boolean) => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'presence',
        payload: { online }
      }));
    }
  }
}));