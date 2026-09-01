'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Award, Zap, Lock, Tag, Trophy } from 'lucide-react';
import { Card, CardContent, Button, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { apiClient } from '@/lib/api/client';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  isUnlocked: boolean;
  progress: string;
  xpReward: number;
}

interface RewardsResponse {
  xp: number;
  level: number;
  nextLevelXp: number;
  completedBookings: number;
  achievements: Achievement[];
}

const LEVEL_TITLES = ['Rookie', 'Contender', 'Skilled Gamer', 'Veteran Gamer', 'Elite Gamer', 'Legend'];
function getLevelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] ?? 'Rookie';
}

// Achievement.progress is a "3 / 5"-style string from the backend — parse it
// into a fill percentage for a visual bar instead of leaving it as text-only.
function progressPercent(progress: string): number {
  const match = progress.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return 0;
  const [, done, total] = match;
  const totalNum = Number(total);
  if (!totalNum) return 0;
  return Math.min(100, Math.round((Number(done) / totalNum) * 100));
}

export default function RewardsPage() {
  const router = useRouter();
  const [activeAchievement, setActiveAchievement] = useState<Achievement | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<RewardsResponse>({
    queryKey: ['rewards'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/rewards');
      return response.data.data;
    },
    staleTime: 30_000,
  });

  const currentXp = data?.xp ?? 0;
  const level = data?.level ?? 1;
  const nextLevelXp = data?.nextLevelXp ?? 500;
  const achievements = data?.achievements ?? [];
  const xpPercentage = Math.min(100, Math.round((currentXp / nextLevelXp) * 100));

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto pb-24">
        <ErrorState
          title="Couldn't load your rewards"
          message={(error as Error)?.message || 'Failed to fetch your XP and badges. Please check your connection.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-24">
      {/* Level & XP Banner */}
      <Card elevation="raised" className="overflow-hidden border border-accent/30 bg-gradient-to-r from-secondary via-secondary to-[#2B2D42] text-white">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white font-heading font-bold text-h3 shadow-card">
                L{level}
              </div>
              <div>
                <span className="text-overline text-white/70 uppercase">Current Tier</span>
                <h1 className="font-heading text-h3 text-white">{getLevelTitle(level)}</h1>
              </div>
            </div>

            <Badge variant="primary" size="md" className="gap-1 bg-white/20 text-white border-0">
              <Zap className="h-4 w-4 fill-primary text-primary" />
              <span>{currentXp} XP</span>
            </Badge>
          </div>

          {/* XP Progress Bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex justify-between text-caption text-white/80">
              <span>Level {level} Progress</span>
              <span>{currentXp} / {nextLevelXp} XP ({xpPercentage}%)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-black/40 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                style={{ width: `${xpPercentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Café Offers — points at the real, café-specific discount system
          instead of the old hardcoded fake voucher codes this section used
          to show (which claimed to apply but never actually did anything
          at checkout). Discounts here are real: café owners set them up,
          and they apply automatically at checkout when a booking qualifies. */}
      <Card elevation="resting" className="border border-border/80">
        <CardContent className="p-5 flex items-start gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Tag className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h3 text-text-primary">Café Offers</h2>
            <p className="text-caption text-text-secondary">
              Participating cafés run their own time-boxed discounts. When you book a slot
              that qualifies, the discount is applied automatically at checkout — no codes
              to remember or claim.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Achievement Badges Grid */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
          <Award className="h-5 w-5 text-accent" />
          <span>Gamer Badges & Milestones</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isLoading && (
            <>
              <Skeleton className="h-24 rounded-3xl" />
              <Skeleton className="h-24 rounded-3xl" />
            </>
          )}
          {!isLoading && achievements.map((ach) => (
            <div
              key={ach.id}
              onClick={() => setActiveAchievement(ach)}
              className={`p-4 rounded-3xl border transition-all flex items-start gap-3.5 cursor-pointer hover:shadow-card ${
                ach.isUnlocked
                  ? 'bg-card border-primary/40 shadow-sm'
                  : 'bg-surface/60 border-border/60 opacity-75'
              }`}
            >
              <div className="text-3xl p-2 rounded-2xl bg-surface flex-shrink-0">
                {ach.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="font-heading text-h4 text-text-primary truncate">
                    {ach.title}
                  </h3>
                  {ach.isUnlocked ? (
                    <span className="text-caption text-success font-bold flex-shrink-0">
                      +{ach.xpReward} XP
                    </span>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                  )}
                </div>

                <p className="text-caption text-text-secondary mt-0.5">{ach.description}</p>

                {!ach.isUnlocked && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${progressPercent(ach.progress)}%` }}
                    />
                  </div>
                )}

                <div className="text-badge font-semibold text-text-secondary mt-2 flex items-center justify-between">
                  <span>Progress: {ach.progress}</span>
                  <span className="text-primary hover:underline">Details →</span>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && achievements.length === 0 && (
            <div className="sm:col-span-2">
              <EmptyState
                title="No badges yet"
                description="Complete your first booking to start unlocking gamer badges and XP."
                icon={<Trophy className="h-7 w-7" />}
                actionLabel="Find a Gaming Café"
                onAction={() => router.push('/')}
              />
            </div>
          )}
        </div>
      </div>

      {/* Achievement Feedback Celebration Modal */}
      {activeAchievement && (
        <div
          onClick={() => setActiveAchievement(null)}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-overlay flex flex-col items-center text-center gap-3"
          >
            <div className="text-5xl p-4 rounded-full bg-primary/10 mb-1">
              {activeAchievement.icon}
            </div>

            <h3 className="font-heading text-h2 font-bold text-text-primary">
              {activeAchievement.title}
            </h3>

            <p className="text-body text-text-secondary">
              {activeAchievement.description}
            </p>

            <div className="w-full rounded-2xl bg-surface p-3 flex items-center justify-between text-caption font-semibold my-1">
              <span className="text-text-secondary">Reward XP:</span>
              <span className="font-bold text-success">+{activeAchievement.xpReward} XP</span>
            </div>

            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => setActiveAchievement(null)}
            >
              Continue Quest
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
