'use client';

import { useState } from 'react';
import { queryKeys } from '@vj/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  ImagePreview,
  PageLoader,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  toast,
} from '@vj/ui';
import { api } from '@/lib/api';
import { Camera, Download, Trash2, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function CapturesPage() {
  const queryClient = useQueryClient();
  const [selectedCapture, setSelectedCapture] = useState<{ id: string; url: string } | null>(null);

  const capturesQuery = useQuery({
    queryKey: queryKeys.captures.mine(1),
    queryFn: () => api.tryOn.listCaptures(1),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tryOn.deleteCapture(id),
    onSuccess: () => {
      toast.success('Portrait removed from Lookbook');
      setSelectedCapture(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.captures.mine(1) });
    },
    onError: () => {
      toast.error('Could not delete capture');
    },
  });

  if (capturesQuery.isLoading) return <PageLoader label="Loading your Virtual Lookbook…" />;
  if (capturesQuery.isError) {
    return (
      <EmptyState
        title="Could not load your lookbook"
        description="Please check your connection and try again."
        action={
          <Button onClick={() => capturesQuery.refetch()} variant="secondary" className="rounded-full">
            Retry
          </Button>
        }
      />
    );
  }

  const items = capturesQuery.data?.items ?? [];

  const handleDownload = async (captureId: string) => {
    try {
      const { downloadUrl, fileName } = await api.tryOn.getCaptureDownload(captureId);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Portrait downloaded');
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <div className="space-y-8">
      {/* Lookbook Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Personal Atelier Portfolio</span>
          </div>
          <h1 className="mt-1 font-serif text-3xl font-light text-foreground">
            My Virtual Lookbook
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Portraits and snapshots captured during your real-time jewellery fitting sessions.
          </p>
        </div>

        <Button asChild size="sm" className="rounded-full gap-2 self-start sm:self-auto">
          <Link href="/try-on">
            <Camera className="h-4 w-4" /> Try Another Piece
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Your Lookbook is Empty"
          description="Experience our virtual mirror, snap high-definition portraits wearing fine jewellery, and save them here."
          action={
            <Button asChild className="rounded-full">
              <Link href="/try-on">Launch Try-On Studio</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div
              key={c.id}
              className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm hover:shadow-xl transition-all"
            >
              <div
                className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-black"
                onClick={() => setSelectedCapture({ id: c.id, url: c.url })}
              >
                <ImagePreview
                  src={c.thumbUrl ?? c.url}
                  alt="Virtual try-on capture"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="rounded-full bg-white/20 backdrop-blur-md px-3 py-1.5 text-xs text-white border border-white/30">
                    View Fullscreen
                  </span>
                </div>
                <div className="absolute top-3 left-3">
                  <Badge className="bg-black/60 backdrop-blur-md text-white border border-white/20 text-[10px]">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                  </Badge>
                </div>
              </div>

              <div className="p-4 flex items-center justify-between gap-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(c.id)}
                  className="rounded-full gap-1.5 text-xs flex-1"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(c.id)}
                  disabled={deleteMutation.isPending}
                  className="rounded-full text-muted-foreground hover:text-destructive h-8 w-8"
                  title="Remove from Lookbook"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Portrait Modal */}
      {selectedCapture && (
        <Dialog open={Boolean(selectedCapture)} onOpenChange={(open) => !open && setSelectedCapture(null)}>
          <DialogContent className="max-w-xl overflow-hidden rounded-3xl p-0 border border-primary/20 bg-card">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="font-serif text-2xl font-light">Lookbook Portrait</DialogTitle>
            </DialogHeader>
            <div className="p-6 pt-0">
              <div className="overflow-hidden rounded-2xl border bg-black aspect-[3/4]">
                <ImagePreview src={selectedCapture.url} alt="Lookbook still" className="h-full w-full object-cover" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-full gap-2"
                  onClick={() => handleDownload(selectedCapture.id)}
                >
                  <Download className="h-4 w-4" /> Download High-Res
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate(selectedCapture.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
