import { BookOpen, MapPin, Monitor, Users, Volume1 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import floorPlanImage from '@/assets/seat-floor-plan.webp';

interface Pos {
  left: string;
  top: string;
}

// Positions match the blanked-out header areas baked into seat-floor-plan.webp.
const zoneLabels = [
  { key: 'quiet', icon: Volume1, pos: { left: '51%', top: '11%' } },
  { key: 'collaborative', icon: Users, pos: { left: '30%', top: '55%' } },
  { key: 'readingLounge', icon: BookOpen, pos: { left: '59%', top: '55%' } },
  { key: 'computerLab', icon: Monitor, pos: { left: '84%', top: '55%' } },
] as const;

function ZoneLabel({ pos, icon, children }: { pos: Pos; icon: ReactNode; children: ReactNode }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 sm:text-xs"
      style={{ left: pos.left, top: pos.top }}
    >
      {icon}
      {children}
    </div>
  );
}

export function FloorPlanArt() {
  const { t } = useTranslation();

  return (
    <div className="relative mb-5">
      <div className="relative aspect-3/2 w-full overflow-hidden rounded-[28px] border border-border shadow-sm">
        <img
          src={floorPlanImage}
          alt={t('landing.seatAvailability.floorPlanAlt')}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {zoneLabels.map(({ key, icon: Icon, pos }) => (
          <ZoneLabel key={key} pos={pos} icon={<Icon className="size-3" />}>
            {t(`landing.seatAvailability.zones.${key}`)}
          </ZoneLabel>
        ))}
      </div>

      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <MapPin className="size-3.5 text-primary" />
          {t('landing.seatAvailability.youAreHere')}
        </span>
      </div>
    </div>
  );
}
