'use client';

import * as React from 'react';
import { Download, Bookmark, Share2, RefreshCw, Sparkles, Check } from 'lucide-react';
import { Button } from './button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog.js';
import { ImagePreview } from './image-preview.js';
import { toast } from './sonner.js';

export interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewUrl: string | null;
  productName?: string;
  onSave?: () => Promise<void> | void;
  isSaving?: boolean;
  onDownload?: () => void;
  isDownloading?: boolean;
}

export function CaptureModal({
  open,
  onOpenChange,
  previewUrl,
  productName = 'Virtual Try-On',
  onSave,
  isSaving = false,
  onDownload,
  isDownloading = false,
}: CaptureModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setSaved(false);
    setCopied(false);
  }, [previewUrl]);

  const handleShare = async () => {
    try {
      if (navigator.share && previewUrl) {
        await navigator.share({
          title: `My ${productName} Try-On`,
          text: `Check out how ${productName} looks on me via Lumière Studio!`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        toast.success('Studio try-on link copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      toast.info('Share dismissed');
    }
  };

  const handleSaveInternal = async () => {
    if (!onSave) return;
    try {
      await onSave();
      setSaved(true);
      toast.success('Snapshot saved to your Lookbook');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save capture');
    }
  };

  const handleDownloadInternal = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `lumiere-tryon-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Snapshot downloaded');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-3xl border border-primary/20 bg-card p-0 shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-4 w-4" />
            <span>Studio Portrait</span>
          </div>
          <DialogTitle className="font-serif text-2xl font-normal text-foreground">
            {productName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Captured live in studio. Download your portrait or save it to your personal lookbook.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2">
          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-black aspect-[3/4] shadow-inner">
            {previewUrl ? (
              <ImagePreview
                src={previewUrl}
                alt={productName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No preview available
              </div>
            )}
            <div className="absolute bottom-2 left-3 text-[10px] font-mono tracking-wider text-white/70 drop-shadow">
              LUMIÈRE VIRTUAL STUDIO
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 p-6 pt-3 sm:flex-col">
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button
              type="button"
              variant="default"
              onClick={handleDownloadInternal}
              disabled={isDownloading || !previewUrl}
              className="gap-2 rounded-xl"
            >
              <Download className="h-4 w-4" />
              {isDownloading ? 'Downloading…' : 'Download'}
            </Button>

            {onSave ? (
              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveInternal}
                disabled={isSaving || saved}
                className="gap-2 rounded-xl"
              >
                {saved ? <Check className="h-4 w-4 text-emerald-500" /> : <Bookmark className="h-4 w-4" />}
                {saved ? 'Saved' : isSaving ? 'Saving…' : 'Save to Lookbook'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={handleShare}
                className="gap-2 rounded-xl"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
                {copied ? 'Copied' : 'Share'}
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between w-full pt-2 border-t text-xs">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retake snapshot</span>
            </button>

            {onSave && (
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share link</span>
              </button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
