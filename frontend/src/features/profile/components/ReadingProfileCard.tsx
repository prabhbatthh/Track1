import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge, Card, CardContent } from '@/components/ui';
import { DifficultyBadge } from '@/components/common';
import type { ReadingProfile } from '@/providers/AuthProvider';

export interface ReadingProfileCardProps {
  profile: ReadingProfile | null;
  isLoading: boolean;
  isError: boolean;
}

// Mirrors the "what readers are saying" AI digest card style (ReviewsPage) — same
// primary-tinted card + Sparkles heading — so every AI-generated card in the app reads
// as part of one visual language.
export function ReadingProfileCard({ profile, isLoading, isError }: ReadingProfileCardProps) {
  const { t } = useTranslation();

  if (isLoading || isError || !profile) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex gap-3 p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? t('profile.readingProfile.loading')
              : t('profile.readingProfile.unavailable')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('profile.readingProfile.heading')}
          </p>
        </div>

        {profile.interests.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('profile.readingProfile.interests')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.interests.map((interest) => (
                <Badge key={interest} variant="outline">
                  {interest}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="text-xs font-medium text-muted-foreground">
            {t('profile.readingProfile.difficulty')}:
          </span>
          <DifficultyBadge difficulty={profile.difficulty} />
          <span className="text-xs font-medium text-muted-foreground">
            {t('profile.readingProfile.preference')}:
          </span>
          <Badge variant="outline">{profile.preference}</Badge>
        </div>

        <p className="text-sm text-foreground">{profile.insight}</p>
      </CardContent>
    </Card>
  );
}
