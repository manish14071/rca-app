import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { User, Message } from '@shared/schema.ts';
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { Button } from '../ui/button.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { useWebSocket } from '@/lib/websocket.ts';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  currentUserId: number;
  selectedUserId: number | null;
  onSelectUser: (userId: number) => void;
}

interface ChatListItem {
  userId: number;
  lastMessage?: Message;
  unreadCount: number;
  isTyping?: boolean;
}

export default function ChatList({ currentUserId, selectedUserId, onSelectUser }: Props) {
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  const { data: users = [], refetch } = useQuery<User[]>({
    queryKey: ['/api/users', { currentUserId }],
    queryFn: () => fetch(`/api/users?currentUserId=${currentUserId}`).then(res => res.json()),
    staleTime: 0
  });

  const { data: chats = [] } = useQuery<ChatListItem[]>({
    queryKey: ['/api/chats', { userId: currentUserId }],
    queryFn: () => fetch(`/api/chats?userId=${currentUserId}`).then(res => res.json()),
  });

  const socket = useWebSocket(state => state.socket);
  const chatMap = new Map(chats.map(chat => [chat.userId, chat]));

  useEffect(() => {
    if (!socket) return;

    const handleTyping = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'typing') {
          setTypingUsers(prev => new Set(prev.add(data.payload.userId)));
          setTimeout(() => {
            setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(data.payload.userId);
              return next;
            });
          }, 2000);
        }
      } catch (error) {
        console.error('Error handling typing indicator:', error);
      }
    };

    socket.addEventListener('message', handleTyping);
    return () => socket.removeEventListener('message', handleTyping);
  }, [socket]);

  const getStatusIndicator = (user: User) => {
    if (user.online) {
      return (
        <div className="flex items-center gap-1 text-xs text-green-500">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Online
        </div>
      );
    }
    
    // Handle null case for lastSeen
    if (!user.lastSeen) {
      return (
        <div className="text-xs text-muted-foreground">
          Last seen a long time ago
        </div>
      );
    }
  
    // Add type assertion for Date conversion
    const lastSeenDate = new Date(user.lastSeen as Date);
    
    return (
      <div className="text-xs text-muted-foreground">
        Last seen {formatDistanceToNow(lastSeenDate)} ago
      </div>
    );
  };

  return (
    <Card className="h-full rounded-xl shadow-lg overflow-hidden">
      <div className="p-4 border-b bg-accent">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Chats</h2>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="p-2 space-y-1">
          {users.map((user) => {
            const chatInfo = chatMap.get(user.id);
            const lastMessage = chatInfo?.lastMessage;
            const unreadCount = chatInfo?.unreadCount || 0;
            const isTyping = typingUsers.has(user.id);

            return (
              <div
                key={user.id}
                className={cn(
                  "flex items-center p-3 rounded-lg cursor-pointer transition-colors group",
                  "hover:bg-accent/50",
                  selectedUserId === user.id ? 'bg-accent' : '',
                  unreadCount > 0 ? 'bg-primary/5' : ''
                )}
                onClick={() => onSelectUser(user.id)}
              >
                <div className="relative">
                  <Avatar className={cn(
                    "h-12 w-12 border-2",
                    user.hasStory ? "ring-2 ring-offset-2 ring-primary" : "",
                    "theme-light:border-gray-200 theme-dark:border-gray-700"
                  )}>
                    <AvatarImage 
                      src={user.avatarUrl || ''} 
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-gradient-to-r from-blue-400 to-purple-500 text-white">
                      {user.username?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {user.online && (
                    <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>

                <div className="ml-4 flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {user.username}
                        {user.statusEmoji && (
                          <span className="ml-2">{user.statusEmoji}</span>
                        )}
                      </span>
                      {user.status && (
                        <span className="text-xs text-muted-foreground truncate">
                          {user.status}
                        </span>
                      )}
                    </div>
                    {lastMessage && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lastMessage.createdAt))} ago
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">
                      {isTyping ? (
                        <span className="text-primary italic">typing...</span>
                      ) : lastMessage ? (
                        lastMessage.deleted ? (
                          <span className="italic text-muted-foreground">
                            Message deleted
                          </span>
                        ) : (
                          lastMessage.content
                        )
                      ) : (
                        getStatusIndicator(user)
                      )}
                    </p>
                    
                    {unreadCount > 0 && (
                      <Badge className="ml-2" variant="default">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}