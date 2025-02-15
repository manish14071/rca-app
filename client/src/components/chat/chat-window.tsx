import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWebSocket } from "../../lib/websocket.ts";
import { Message } from "@shared/schema.ts";
import { Card } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Trash2,
  Edit,
  Search,
  Bell,
  BellOff,
  MoreVertical,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { queryClient, apiRequest } from "@/lib/queryClient.ts";
import { useToast } from "@/hooks/use-toast.ts";
import MessageInput from "./message-input.tsx";
import { MediaPreview } from "./media-preview.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar.tsx";

interface Props {
  currentUserId: number;
  selectedUserId: number | null;
  users?: {
    id: number;
    username: string;
    avatarUrl?: string;
    status?: string;
    online?: boolean;
  }[];
}

interface MessageGroup {
  senderId: number;
  messages: Message[];
}

export default function ChatWindow({
  currentUserId,
  selectedUserId,
  users,
}: Props) {
  const [selectedUser, setSelectedUser] = useState<{
    id: number;
    username: string;
    avatarUrl?: string;
    status?: string;
    online?: boolean;
  } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socket = useWebSocket((state) => state.socket);
  const { toast } = useToast();
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    notificationSound.current = new Audio("/notification.mp3");
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId && users) {
      const user = users.find((u) => u.id === selectedUserId);
      if (user) setSelectedUser(user);
    }
  }, [selectedUserId, users]);

  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
      if (permission === "granted") {
        toast({
          title: "Notifications enabled",
          description: "You will now receive notifications for new messages",
        });
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      toast({
        title: "Error",
        description: "Failed to enable notifications",
        variant: "destructive",
      });
    }
  };

  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>(
    {
      queryKey: ["/api/messages", selectedUserId],
      queryFn: async () => {
        if (!selectedUserId || currentUserId === selectedUserId) return [];
        const response = await fetch(
          `/api/messages/${selectedUserId}?currentUserId=${currentUserId}`
        );
        if (!response.ok) throw new Error("Failed to fetch messages");
        return response.json();
      },
      enabled: !!selectedUserId && !!currentUserId,
    }
  );

  const groupMessages = (messages: Message[]): MessageGroup[] => {
    const grouped: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    messages.forEach((message) => {
      if (!currentGroup || currentGroup.senderId !== message.senderId) {
        currentGroup = { senderId: message.senderId, messages: [] };
        grouped.push(currentGroup);
      }
      currentGroup.messages.push(message);
    });

    return grouped;
  };

  const messageGroups = groupMessages(
    searchQuery
      ? messages.filter((msg) =>
          msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : messages
  );

  const editMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      await apiRequest("PATCH", `/api/messages/${id}/edit`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/messages", selectedUserId],
      });
      toast({
        title: "Message updated",
        description: "Message edited successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to edit message",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/messages/${id}/delete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/messages", selectedUserId],
      });
      toast({
        title: "Message deleted",
        description: "Message removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "newMessage") {
          const message = data.payload;
          if (
            message.senderId === selectedUserId ||
            message.receiverId === selectedUserId
          ) {
            refetchMessages();
            if (
              notificationsEnabled &&
              document.hidden &&
              message.senderId !== currentUserId
            ) {
              notificationSound.current?.play();
              new Notification("New Message", { body: message.content });
            }
          }
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [
    socket,
    selectedUserId,
    refetchMessages,
    notificationsEnabled,
    currentUserId,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canEditMessage = (message: Message) => {
    const messageTime = new Date(message.createdAt).getTime();
    return (
      message.senderId === currentUserId &&
      Date.now() - messageTime <= 15 * 60 * 1000
    );
  };

  if (!selectedUserId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">
          Select a chat to start messaging
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-accent flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowProfile(true)}
          >
            <Avatar className="h-10 w-10 border-2 border-primary">
              <AvatarImage src={selectedUser?.avatarUrl} />
              <AvatarFallback>{selectedUser?.username?.[0]}</AvatarFallback>
            </Avatar>
          </Button>
          <div className="flex flex-col">
            <Button
              variant="ghost"
              className="text-lg font-semibold p-0 h-auto"
              onClick={() => setShowProfile(true)}
            >
              {selectedUser?.username}
            </Button>
            <div className="text-sm text-muted-foreground">
              {selectedUser?.online ? (
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Online
                </div>
              ) : (
                selectedUser?.status || "Hey there! I'm using ChatApp"
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={requestNotificationPermission}
          >
            {notificationsEnabled ? <Bell /> : <BellOff />}
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical />
          </Button>
        </div>
      </div>

      {/* Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Information</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24 border-4 border-primary">
              <AvatarImage src={selectedUser?.avatarUrl} />
              <AvatarFallback className="text-3xl">
                {selectedUser?.username?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h2 className="text-2xl font-bold">{selectedUser?.username}</h2>
              <p className="text-muted-foreground">{selectedUser?.status}</p>
              <div className="mt-2 text-sm text-muted-foreground">
                {selectedUser?.online ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-chat-pattern bg-chat-background">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Input
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          </div>
        </div>

        {messageGroups.map((group, groupIndex) => {
          const showDate =
            groupIndex === 0 ||
            !isSameDay(
              new Date(group.messages[0].createdAt),
              new Date(messageGroups[groupIndex - 1].messages[0].createdAt)
            );

          return (
            <div key={group.messages[0].id} className="space-y-4">
              {showDate && (
                <div className="flex justify-center my-4">
                  <Badge variant="secondary" className="bg-background">
                    {formatMessageDate(group.messages[0].createdAt)}
                  </Badge>
                </div>
              )}
              {group.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2 items-end",
                    message.senderId === currentUserId
                      ? "justify-end"
                      : "justify-start"
                  )}
                >
                  {message.senderId !== currentUserId && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={selectedUser?.avatarUrl} />
                      <AvatarFallback>
                        {selectedUser?.username?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <Card
                    className={cn(
                      "max-w-[85%] p-3 relative",
                      message.senderId === currentUserId
                        ?"text-black"
                        : "text-black",
                      message.deleted && "opacity-50",
                      searchQuery &&
                        message.content
                          ?.toLowerCase()
                          .includes(searchQuery.toLowerCase()) &&
                        "ring-2 ring-yellow-500 dark:ring-yellow-400" // Added dark mode variant
                    )}
                  >
                    {message.content && (
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
                    {message.mediaUrl && (
                      <MediaPreview
                        url={message.mediaUrl}
                        fileName={message.mediaUrl.split("/").pop()}
                      />
                    )}
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <span className="text-xs opacity-70">
                        {formatMessageTime(message.createdAt)}
                      </span>
                      {canEditMessage(message) && !message.deleted && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-current hover:bg-white/10"
                            onClick={() => {
                              setEditingMessage(message);
                              setEditContent(message.content);
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-current hover:bg-white/10"
                            onClick={() => deleteMutation.mutate(message.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <MessageInput currentUserId={currentUserId} receiverId={selectedUserId} />

      {/* Edit Dialog */}
      <Dialog
        open={!!editingMessage}
        onOpenChange={() => setEditingMessage(null)}
      >
        <DialogContent>
          <Input
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="mt-4"
          />
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                if (editingMessage) {
                  editMutation.mutate({
                    id: editingMessage.id,
                    content: editContent,
                  });
                  setEditingMessage(null);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Utility functions
function formatMessageDate(timestamp: Date | string) {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatMessageTime(timestamp: Date | string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(date1: Date, date2: Date) {
  return date1.toDateString() === date2.toDateString();
}
