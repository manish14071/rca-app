import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWebSocket } from "../../lib/websocket.ts";
import { Message, messages } from "@shared/schema.ts";
import { Card } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Trash2, Edit, Search, Bell, BellOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { queryClient, apiRequest } from "@/lib/queryClient.ts";
import { useToast } from "@/hooks/use-toast.ts";
import MessageInput from "./message-input.tsx";
import { MediaPreview } from "./media-preview.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

interface Props {
  currentUserId: number;
  selectedUserId: number | null;
  users?: { id: number; username: string }[];
  selectedUser?: { online: boolean };
}

interface MessageGroup {
  senderId: number;
  messages: Message[];
}

export default function ChatWindow({
  currentUserId,
  selectedUserId,
  users,
  selectedUser,
}: Props) {
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
        if (!response.ok) {
          throw new Error("Failed to fetch messages");
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      },
      enabled: !!selectedUserId && !!currentUserId,
    }
  );

  const filteredMessages = searchQuery
    ? messages.filter((msg: any) =>
        msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Group messages by sender and date
  const groupMessages = (messages: Message[]): MessageGroup[] => {
    // Ensure messages is an array
    const validMessages = Array.isArray(messages) ? messages : [];
    const grouped: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    validMessages.forEach((message) => {
      if (!currentGroup || currentGroup.senderId !== message.senderId) {
        currentGroup = {
          senderId: message.senderId,
          messages: [],
        };
        grouped.push(currentGroup);
      }
      currentGroup.messages.push(message);
    });

    return grouped;
  };
  const messageGroups = groupMessages(filteredMessages);

  // Rest of the mutation handlers remain unchanged
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
        description: "Your message has been edited successfully",
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
        description: "Your message has been deleted",
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
        console.log("Received WebSocket message in chat window:", data);

        if (data.type === "newMessage") {
          const message = data.payload;
          if (
            message.senderId === selectedUserId ||
            message.receiverId === selectedUserId
          ) {
            console.log("Refetching messages for chat:", selectedUserId);
            refetchMessages();
            if (
              notificationsEnabled &&
              document.hidden &&
              message.senderId !== currentUserId
            ) {
              notificationSound.current?.play().catch(console.error);
              new Notification("New Message", {
                body: message.content,
                icon: "/chat-icon.png",
              });
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
    const currentTime = new Date().getTime();
    const timeDiff = currentTime - messageTime;
    return message.senderId === currentUserId && timeDiff <= 15 * 60 * 1000;
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
      <div className="p-4 border-b bg-accent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-lg">
              {users?.find((u) => u.id === selectedUserId)?.username}
            </h2>
            {selectedUser?.online && (
              <Badge variant="secondary" className="bg-green-500 text-white">
                Online
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={requestNotificationPermission}
              className="flex-shrink-0"
            >
              {notificationsEnabled ? (
                <Bell className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-accent/5">
        {messageGroups.map((group, groupIndex) => {
          const showDate =
            groupIndex === 0 ||
            !isSameDay(
              new Date(group.messages[0].createdAt),
              new Date(messageGroups[groupIndex - 1].messages[0].createdAt)
            );

          const isFromMe = group.senderId === currentUserId;

          return (
            <div key={group.messages[0].id} className="space-y-1">
              {showDate && (
                <div className="flex justify-center my-4">
                  <Badge variant="secondary" className="bg-background">
                    {formatMessageDate(group.messages[0].createdAt)}
                  </Badge>
                </div>
              )}
              {group.messages.map((message, messageIndex) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.senderId === currentUserId
                      ? "justify-end"
                      : "justify-start" // Use senderId instead of group.senderId
                  )}
                  
                >

                  
                  <Card
                    className={cn(
                      "max-w-[70%] p-3",
                      isFromMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-card",
                      messageIndex !== 0 && "rounded-t-md",
                      message.deleted ? "opacity-50" : "",
                      searchQuery &&
                        message.content
                          ?.toLowerCase()
                          .includes(searchQuery.toLowerCase())
                        ? "ring-2 ring-yellow-500 dark:ring-yellow-400"
                        : ""
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
                            className="h-6 w-6"
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
                            className="h-6 w-6"
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

      <MessageInput currentUserId={currentUserId} receiverId={selectedUserId} />

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

function formatMessageDate(timestamp: Date | string) {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (messageDate.toDateString() === today.toDateString()) {
    return "Today";
  } else if (messageDate.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return messageDate.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
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
