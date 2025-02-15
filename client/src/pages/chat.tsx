import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import ChatWindow from '../components/chat/chat-window.tsx';
import ChatList from '../components/chat/chat-list.tsx';
import { Button } from '../components/ui/button.tsx';
import { useWebSocket } from '../lib/websocket.ts';
import { queryClient } from '@/lib/queryClient.ts';


export default function ChatPage() {
  const [location, navigate] = useLocation();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const connect = useWebSocket(state => state.connect);
  const disconnect = useWebSocket(state => state.disconnect);

  // Get currentUserId from localStorage (set during auth)
  const currentUserId = parseInt(localStorage.getItem('userId') || '');

// Add logout function
const handleLogout = () => {
  // Clear authentication data
  localStorage.removeItem('userId');
  
  // Clear WebSocket connection
  disconnect();
  
  // Clear React Query cache
  queryClient.clear();
  
  // Redirect to auth page
  navigate('/auth');
};

  

  useEffect(() => {
    if (!currentUserId || isNaN(currentUserId)) {
      navigate('/auth');
      return;
    }

    connect(currentUserId);
    return () => disconnect();
  }, [currentUserId, connect, disconnect, navigate]);

  if (!currentUserId || isNaN(currentUserId)) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <div className="absolute top-0 right-0 p-4">
        <Button 
          variant="ghost" 
          onClick={handleLogout}
          className="text-destructive hover:bg-destructive/10"
        >
          Logout
        </Button>
      </div>
      <div className="w-80 border-r">
        <ChatList
          currentUserId={currentUserId}
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
        />
      </div>
      <div className="flex-1">
        {selectedUserId ? (
          <ChatWindow
            currentUserId={currentUserId}
            selectedUserId={selectedUserId}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a chat to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}