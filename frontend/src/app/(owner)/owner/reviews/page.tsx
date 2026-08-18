'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, MessageSquare, Edit3, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, Badge, Button, Textarea, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';
import { getOwnerStatus } from '@/lib/api/owner';
import { listCafeReviews, replyToReview } from '@/lib/api/reviews';
import type { Review } from '@/types';

export default function OwnerReviewsPage() {
  const queryClient = useQueryClient();
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data: statusRes } = useQuery({
    queryKey: ['owner-status-reviews'],
    queryFn: getOwnerStatus,
  });
  const cafeId = statusRes?.cafe?.id as string | undefined;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['owner-reviews', cafeId],
    queryFn: () => listCafeReviews(cafeId!),
    enabled: !!cafeId,
  });
  const reviews: Review[] = data?.items ?? [];

  const replyMut = useMutation({
    mutationFn: (vars: { reviewId: string; reply: string }) => replyToReview(vars.reviewId, vars.reply),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-reviews'] });
      setReplyingId(null);
      setReplyText('');
    },
  });

  const startReply = (rev: Review) => {
    setReplyingId(rev.id);
    setReplyText(rev.ownerReply ?? '');
  };

  return (
    <div className="max-w-4xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-6">
      <div className="border-b border-border pb-6">
        <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
          <span>Customer Reviews & Ratings</span>
        </h1>
        <p className="text-caption text-text-secondary mt-1">
          Real-time customer feedback for your venue. Replies are public and visible to every gamer who reads this review.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load reviews"
          message={(error as Error)?.message ?? 'Could not fetch reviews for your café.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && reviews.length === 0 && (
        <EmptyState
          title="No Customer Reviews Yet"
          description="As gamers complete sessions at your venue, their reviews and ratings will appear here."
          icon={<Star className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {!isLoading && !isError && reviews.length > 0 && (
        <div className="flex flex-col gap-4">
          {reviews.map((rev) => {
            const isReplying = replyingId === rev.id;
            const thisMutPending = replyMut.isPending && replyMut.variables?.reviewId === rev.id;
            return (
              <Card key={rev.id} elevation="raised">
                <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-heading text-body font-bold text-text-primary">
                        {rev.gamerName || 'Gamer'}
                      </span>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {new Date(rev.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <Badge variant="warning" size="md" className="flex items-center gap-1 flex-shrink-0">
                      <Star className="h-3 w-3 fill-current" />
                      {rev.rating}.0
                    </Badge>
                  </div>

                  <p className="text-body text-text-secondary">{rev.comment}</p>

                  {rev.ownerReply && !isReplying && (
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3.5 flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-primary uppercase tracking-wide">Your reply</span>
                      <p className="text-caption text-text-primary">{rev.ownerReply}</p>
                    </div>
                  )}

                  {!isReplying ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startReply(rev)}
                      className="self-start gap-1.5"
                    >
                      {rev.ownerReply ? <Edit3 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                      <span>{rev.ownerReply ? 'Edit Reply' : 'Reply to Review'}</span>
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-3 pt-1">
                      <Textarea
                        placeholder="Write your public response to the gamer..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                      {replyMut.isError && thisMutPending === false && (
                        <p className="text-caption text-error">Couldn&apos;t post your reply — please try again.</p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!replyText.trim()}
                          isLoading={thisMutPending}
                          loadingText="Posting..."
                          onClick={() => replyMut.mutate({ reviewId: rev.id, reply: replyText.trim() })}
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Post Reply
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setReplyingId(null); setReplyText(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
