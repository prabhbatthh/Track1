import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ProgressBar } from '@/components/common';
import { Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface RatingSummaryProps {
  averageRating: number;
  totalReviews: number;
  breakdown: { stars: number; percent: number }[];
}

export function RatingSummary({ averageRating, totalReviews, breakdown }: RatingSummaryProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="grid gap-6 p-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center gap-1 sm:pr-6">
          <p className="text-4xl font-semibold text-foreground">{averageRating.toFixed(1)}</p>
          <div className="flex" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={cn(
                  'size-4',
                  index < Math.round(averageRating) ? 'fill-warning text-warning' : 'text-border',
                )}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('reviews.summary.totalReviews', { count: totalReviews })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {breakdown.map((row) => (
            <ProgressBar
              key={row.stars}
              percent={row.percent}
              label={t('reviews.summary.starsLabel', { count: row.stars })}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
