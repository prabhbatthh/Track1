import { Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// 28°37'58.4"N 77°13'09.7"E — Connaught Place, New Delhi.
const LATITUDE = 28.632889;
const LONGITUDE = 77.219361;
const BBOX_DELTA = 0.005;

const EMBED_SRC = `https://www.openstreetmap.org/export/embed.html?bbox=${
  LONGITUDE - BBOX_DELTA
}%2C${LATITUDE - BBOX_DELTA}%2C${LONGITUDE + BBOX_DELTA}%2C${
  LATITUDE + BBOX_DELTA
}&layer=mapnik&marker=${LATITUDE}%2C${LONGITUDE}`;

const DIRECTIONS_HREF = `https://www.google.com/maps/search/?api=1&query=${LATITUDE},${LONGITUDE}`;

export function LibraryMap() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <iframe
        title={t('contactUs.map.title')}
        src={EMBED_SRC}
        loading="lazy"
        className="h-80 w-full rounded-2xl border border-border"
      />
      <a
        href={DIRECTIONS_HREF}
        target="_blank"
        rel="noreferrer"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Navigation className="size-4" />
        {t('contactUs.map.getDirections')}
      </a>
    </div>
  );
}
