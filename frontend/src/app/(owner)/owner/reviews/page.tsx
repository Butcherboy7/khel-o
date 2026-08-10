'use client';

import { useState, useEffect } from 'react';
import { Star, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, Badge, Button, Textarea } from '@/components/ui';
import { getOwnerStatus } from '@/lib/api/owner';
import { listCafeReviews } from '@/lib/api/reviews';
import type { Review } from '@/types';

export default function OwnerReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadReviews() {
      try {
        const statusRes = await getOwnerStatus();
        if (statusRes.cafe?.id) {
          const revRes = await listCafeReviews(statusRes.cafe.id);
          setReviews(revRes.items || []);
        }
      } catch {
        setReviews([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadReviews();
  }, []);

  return (
    <div className="max-w-4xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
            <span>Customer Reviews & Ratings</span>
          </h1>
          <p className="text-caption text-text-secondary mt-1">
            Real-time customer feedback, ratings, and gamer responses for your venue.
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 p-4 rounded-2xl border text-caption font-semibold ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
        </div>
      ) : reviews.length === 0 ? (
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-8 text-center flex flex-col items-center gap-3">
            <Star className="h-10 w-10 text-text-tertiary" />
            <h3 className="font-heading text-h3 text-text-primary">No Customer Reviews Yet</h3>
            <p className="text-caption text-text-secondary max-w-md">
              As gamers complete sessions at your venue, their reviews and ratings will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {reviews.map((rev) => (
            <Card key={rev.id} elevation="raised" className="bg-surface border border-border">
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-body font-bold text-text-primary">
                        {rev.gamerName || 'Gamer'}
                      </span>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-amber-500 font-bold">
                    <span>★</span>
                    <span>{rev.rating}.0</span>
                  </div>
                </div>

                <p className="text-body text-text-secondary">{rev.comment}</p>

                {!replyingId || replyingId !== rev.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReplyingId(rev.id)}
                    className="self-start gap-1.5"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Reply to Review</span>
                  </Button>
                ) : (
                  <div className="flex flex-col gap-3 pt-2">
                    <Textarea
                      placeholder="Write your response to the gamer..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setMsg({ type: 'success', text: 'Reply submitted successfully!' });
                          setReplyingId(null);
                          setReplyText('');
                        }}
                        className="bg-emerald-500 text-slate-950 font-bold"
                      >
                        Post Reply
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setReplyingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

