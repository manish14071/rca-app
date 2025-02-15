import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog.tsx';
import { FileText, Image as ImageIcon, Video, Music, FileArchive, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';

interface Props {
  url: string;
  fileName?: string;
  fileSize?: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function MediaPreview({ url, fileName, fileSize }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const fileType = url.split('.').pop()?.toLowerCase();
  const isOversize = fileSize && fileSize > MAX_FILE_SIZE;

  const getFileIcon = () => {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType!)) return <ImageIcon className="h-6 w-6" />;
    if (['mp4', 'webm', 'mov'].includes(fileType!)) return <Video className="h-6 w-6" />;
    if (['mp3', 'wav', 'ogg'].includes(fileType!)) return <Music className="h-6 w-6" />;
    if (['pdf', 'doc', 'docx'].includes(fileType!)) return <FileText className="h-6 w-6" />;
    if (['zip', 'rar', '7z'].includes(fileType!)) return <FileArchive className="h-6 w-6" />;
    return <FileText className="h-6 w-6" />;
  };

  const renderPreview = () => {
    if (isOversize) {
      return (
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>File size exceeds 10MB limit</span>
        </div>
      );
    }

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType!)) {
      return (
        <img
          src={url}
          alt={fileName || 'Image preview'}
          className="max-w-full h-auto rounded-md cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setIsOpen(true)}
          style={{ maxHeight: '200px' }}
        />
      );
    }

    if (['mp4', 'webm', 'mov'].includes(fileType!)) {
      return (
        <video
          src={url}
          controls
          className="max-w-full rounded-md"
          style={{ maxHeight: '200px' }}
        />
      );
    }

    if (['mp3', 'wav', 'ogg'].includes(fileType!)) {
      return (
        <audio src={url} controls className="w-full" />
      );
    }

    // For other file types, show a download button with icon
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2 bg-accent rounded-md hover:bg-accent/80 transition-colors"
      >
        {getFileIcon()}
        <span className="text-sm truncate">
          {fileName || 'Download file'}
        </span>
      </a>
    );
  };

  return (
    <div className="mt-2">
      {renderPreview()}
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl w-full p-0">
          <img
            src={url}
            alt={fileName || 'Full size preview'}
            className="w-full h-auto"
          />
          <div className="p-4 bg-background">
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a href={url} download target="_blank" rel="noopener noreferrer">
                Download Original
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
