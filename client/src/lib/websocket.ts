import { create } from 'zustand';

interface WebSocketStore {
  socket: WebSocket | null;
  isConnecting: boolean;
  connect: (userId: number) => void;
  disconnect: () => void;
  sendTyping: (receiverId: number) => void;
}

export const useWebSocket = create<WebSocketStore>((set, get) => ({
  socket: null,
  isConnecting: false,

  connect: (userId: number) => {
    const { socket, isConnecting } = get();

    // Prevent multiple connection attempts
    if (isConnecting) return;

    // Force disconnect any existing connection
    if (socket) {
      socket.close();
    }

    set({ isConnecting: true });

    const reconnect = (retryCount = 0) => {
      const maxRetries = 5;
      const baseDelay = 1000; // Start with 1 second

      if (retryCount >= maxRetries) {
        console.error('Max WebSocket reconnection attempts reached');
        set({ isConnecting: false });
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log(`[WebSocket] Attempting connection (attempt ${retryCount + 1}/${maxRetries}):`, wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        set({ socket: ws, isConnecting: false });

        // Send authentication immediately after connection
        ws.send(JSON.stringify({
          type: 'auth',
          payload: { userId }
        }));
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected with code ${event.code}, reason: ${event.reason}`);
        set({ socket: null });

        // Don't reconnect if this was an intentional close
        if (event.code !== 1000) {
          const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000); // Max 10 seconds
          console.log(`[WebSocket] Attempting reconnect in ${delay}ms...`);
          setTimeout(() => reconnect(retryCount + 1), delay);
        } else {
          set({ isConnecting: false });
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Received message:', data);

          const queryClient = (window as any).queryClient;
          if (!queryClient) {
            console.error('[WebSocket] QueryClient not found');
            return;
          }

          switch (data.type) {
            case 'newMessage':
              // Invalidate both sender and receiver message queries
              queryClient.invalidateQueries({ 
                queryKey: ['/api/messages', data.payload.senderId] 
              });
              queryClient.invalidateQueries({ 
                queryKey: ['/api/messages', data.payload.receiverId] 
              });
              queryClient.invalidateQueries({ 
                queryKey: ['/api/chats'] 
              });
              break;

            case 'typing':
              console.log('[WebSocket] User is typing:', data.payload.userId);
              break;

            case 'userStatus':
              console.log('[WebSocket] User status update:', data.payload);
              const { userId: statusUserId, online } = data.payload;
              queryClient.invalidateQueries({ 
                queryKey: ['/api/users'] 
              });
              break;

            case 'error':
              console.error('[WebSocket] Error from server:', data.payload.message);
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };
    };

    reconnect();
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close(1000, 'Intentional disconnect');
      set({ socket: null, isConnecting: false });
    }
  },

  sendTyping: (receiverId: number) => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'typing',
        payload: { receiverId }
      }));
    } else {
      console.warn('[WebSocket] Cannot send typing notification: not connected');
    }
  }
}));