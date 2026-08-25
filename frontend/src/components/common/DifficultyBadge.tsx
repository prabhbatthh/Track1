import { Sparkles } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui';

// Shared by BookDetailsPage's AI Book Insights card and the profile's AI Reading Profile
// card — both surface the same Beginner/Intermediate/Advanced/Unknown vocabulary the
// backend's single AI-insights call returns (see books/insights.py).
const VARIANT_BY_DIFFICULTY: Record<string, BadgeVariant> = {
  Beginner: 'success',
  Intermediate: 'warning',
  Advanced: 'danger',
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <div className="relative inline-flex items-center">
      <Badge variant={VARIANT_BY_DIFFICULTY[difficulty] ?? 'outline'} className="relative pr-5">
        {difficulty}
        <span title="AI Generated" className="absolute -top-1 -right-1">
          <Sparkles className="size-3.5 text-amber-500 fill-amber-300 drop-shadow-sm" />
        </span>
      </Badge>
    </div>
  );
}
