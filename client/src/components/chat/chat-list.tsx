import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { User, Message } from '@shared/schema.ts';
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { Button } from '../ui/button.tsx';

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
  const { data: users = [],refetch } = useQuery<User[]>({
    queryKey: ['/api/users', { currentUserId }],
    queryFn: () => fetch(`/api/users?currentUserId=${currentUserId}`).then(res => res.json()),
    staleTime: 0
    
   
  });
  console.log('ChatList users:', users.map(u => ({ 
    id: u.id, 
    username: u.username, 
    isCurrent: u.id === currentUserId 
  })));

  <Button onClick={() => refetch()}>Refresh Users</Button>
  console.log('Users from API:', users);

  const { data: chats = [] } = useQuery<ChatListItem[]>({
    queryKey: ['/api/chats', { userId: currentUserId }],
    queryFn: () => fetch(`/api/chats?userId=${currentUserId}`).then(res => res.json()),
  });

  // Create a map of userId to ChatListItem for quick lookup
  const chatMap = new Map(chats.map(chat => [chat.userId, chat]));

  const formatTime = (timestamp: Date | string) => {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <Card className="h-full">
      <div className="p-4 border-b bg-accent">
        <h2 className="font-semibold text-lg">Chats</h2>
      </div>
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="p-4 space-y-2">
          {users.map((user) => {
            const chatInfo = chatMap.get(user.id);
            const lastMessage = chatInfo?.lastMessage;
            const unreadCount = chatInfo?.unreadCount || 0;
            const isTyping = chatInfo?.isTyping;

            return (
              <Card
                key={user.id}
                className={cn(
                  "p-4 cursor-pointer hover:bg-accent/50 transition-colors",
                  selectedUserId === user.id ? 'bg-accent' : '',
                  unreadCount > 0 ? 'bg-primary/5' : ''
                )}
                onClick={() => onSelectUser(user.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{user.username}</span>
                      {user.online && (
                        <Badge variant="secondary" className="bg-green-500 text-white">
                          Online
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {isTyping ? (
                        <span className="text-primary italic">typing...</span>
                      ) : lastMessage ? (
                        lastMessage.deleted ? 'Message deleted' : lastMessage.content
                      ) : (
                        'No messages yet'
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end ml-4">
                    {lastMessage && (
                      <span className="text-xs text-muted-foreground">
                        {formatTime(lastMessage.createdAt)}
                      </span>
                    )}
                    {unreadCount > 0 && (
                      <Badge className="mt-1" variant="default">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}