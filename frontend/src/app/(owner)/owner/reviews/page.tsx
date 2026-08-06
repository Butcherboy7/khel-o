'use client';

import { useState } from 'react';
import { Star, MessageSquare, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, Badge, Button, Textarea } from '@/components/ui';

export default function OwnerReviewsPage() {
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const reviews = [
    {
      id: 'rev_1',
      gamerName: 'Aman Verma',
      rating: 5,
      date: '2026-08-03',
      hardwareTier: 'Flagship RTX 4080 Pod',
      comment: 'Top tier setup! Zero latency, 240Hz monitors are buttery smooth for Valorant ranked games.',
      reply: 'Thanks Aman! Glad you loved the RTX 4080 pod setup. See you next weekend!'
    },
    {
      id: 'rev_2',
      gamerName: 'Karan Patel',
      rating: 4,
      date: '2026-08-01',
      hardwareTier: 'High-End RTX 4070 Pod',
      comment: 'Great lounge vibe and cold drinks. Ac was super comfortable.',
      reply: null
    }
  ];

  return (
    <div className="max-w-4xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
            <span>Customer Reviews & Ratings</span>
          </h1>
          <p className="text-caption text-text-secondary">View customer ratings, reply to feedback, and report inappropriate reviews.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {reviews.map((rev) => (
          <Card key={rev.id} elevation="raised" className="bg-surface border border-border">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-body font-bold text-text-primary">{rev.gamerName}</span>
                    <Badge variant="success" size="sm">{rev.hardwareTier}</Badge>
                  </div>
                  <span className="text-xs text-text-tertiary">{rev.date}</span>
                </div>

                <div className="flex items-center gap-1 text-amber-500 font-bold">
                  <span>★</span>
                  <span>{rev.rating}.0</span>
                </div>
              </div>

              <p className="text-body text-text-secondary">{rev.comment}</p>

              {rev.reply && (
                <div className="p-3.5 rounded-xl bg-surface-hover border border-border/80 text-caption">
                  <span className="font-bold text-emerald-600 block mb-1">Owner Reply:</span>
                  <span className="text-text-secondary">{rev.reply}</span>
                </div>
              )}

              {!rev.reply && replyingId !== rev.id && (
                <Button variant="outline" size="sm" onClick={() => setReplyingId(rev.id)} className="self-start gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  <span>Reply to Review</span>
                </Button>
              )}

              {replyingId === rev.id && (
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
                        rev.reply = replyText;
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
    </div>
  );
}
