import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Input } from '../ui/input.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Send, Image, Loader2, X } from 'lucide-react';
import { useWebSocket } from '@/lib/websocket.ts';
import { queryClient, apiRequest } from '@/lib/queryClient.ts';
import { useToast } from '@/hooks/use-toast.ts';

interface Props {
  currentUserId: number;
  receiverId: number;
}

export default function MessageInput({ currentUserId, receiverId }: Props) {
  const [content, setContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const sendTyping = useWebSocket(state => state.sendTyping);
  const { toast } = useToast();

  const sendMessage = useMutation({
    mutationFn: async ({ content, file }: { content: string; file?: File }) => {
      if (!content.trim() && !file) {
        throw new Error('Message cannot be empty');
      }
      let mediaUrl = null;

      // Add validation
      if (currentUserId === receiverId) {
        throw new Error('Cannot send message to yourself');
      }

      console.log('Sending message with IDs:', { 
        senderId: currentUserId, 
        receiverId 
      });

      if (file) {
        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadRes.ok) throw new Error('Failed to upload file');
          const { url } = await uploadRes.json();
          mediaUrl = url;
        } catch (error) {
          toast({
            title: 'Upload failed',
            description: 'Failed to upload media file',
            variant: 'destructive',
          });
          return;
        } finally {
          setIsUploading(false);
        }
      }

      await apiRequest('POST', '/api/messages', {
        content,
        senderId: currentUserId,
        receiverId,
        mediaUrl,
      });
    },
    onSuccess: () => {
      setContent('');
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/messages', receiverId] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      sendTyping(receiverId);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 5MB',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  return (
    <div className="p-4 border-t">
      {selectedFile && (
        <div className="mb-2 p-2 bg-accent rounded-md flex items-center justify-between">
          <span className="text-sm truncate">{selectedFile.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedFile(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,.pdf,.doc,.docx"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
        >
          <Image className="h-4 w-4" />
        </Button>
        <Input
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleTyping();
          }}
          placeholder="Type a message..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (content.trim() || selectedFile)) {
              sendMessage.mutate({ content, file: selectedFile || undefined });
            }
          }}
        />
        <Button
          disabled={(!content.trim() && !selectedFile) || isUploading}
          onClick={() => sendMessage.mutate({ content, file: selectedFile || undefined })}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}