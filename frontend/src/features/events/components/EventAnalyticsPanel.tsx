import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ExportButton } from '@/components/common';
import { Loader } from '@/components/ui';
import { apiGet, getErrorMessage } from '@/lib/api';

import {
  FillRateDonut,
  RegistrationTrendChart,
  RoleBreakdownBars,
} from './EventAnalyticsCharts';

interface AnalyticsRegistrant {
  id: string;
  full_name: string;
  email: string;
  role: string;
  registered_at: string;
}

interface RoleBreakdown {
  role: string;
  count: number;
}

interface EventAnalytics {
  event_id: string;
  title: string;
  date: string;
  location: string;
  capacity: number;
  total_registered: number;
  fill_rate: number;
  registrants_by_role: RoleBreakdown[];
  registrants: AnalyticsRegistrant[];
}

export interface EventAnalyticsPanelProps {
  eventId: string;
  eventTitle: string;
  token: string;
}

function formatRegistrationDate(registeredAt: string | null | undefined): string {
  if (!registeredAt) return '';
  try {
    const date = new Date(registeredAt);
    if (isNaN(date.getTime())) return String(registeredAt);
    return date.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(registeredAt);
  }
}

export function EventAnalyticsPanel({ eventId, eventTitle, token }: EventAnalyticsPanelProps) {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<EventAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<EventAnalytics>(`/events/${eventId}/analytics`, token)
      .then((data) => {
        if (!cancelled) {
          setAnalytics(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, t('events.analytics.loadError')));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, token, t]);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{t('events.analytics.title')}</p>
      </div>

      {loading && (
        <div className="flex h-20 items-center justify-center">
          <Loader />
        </div>
      )}

      {!loading && error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {!loading && !error && analytics && (
        <div className="mt-3 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('events.analytics.totalRegistered')}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {analytics.total_registered} / {analytics.capacity}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('events.analytics.fillRate')}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {Math.round(analytics.fill_rate * 100)}%
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 bg-surface p-1">
            <div className="flex flex-col gap-4 rounded-md border border-border-muted bg-secondary/40 p-3 sm:flex-row sm:items-center">
              <FillRateDonut
                percent={analytics.fill_rate * 100}
                registered={analytics.total_registered}
                capacity={analytics.capacity}
                label={t('events.analytics.capacityFilled')}
              />
              <RoleBreakdownBars
                data={analytics.registrants_by_role}
                label={t('events.analytics.byRole')}
              />
            </div>

            <RegistrationTrendChart
              registeredAtDates={(analytics.registrants || []).map((r) => r.registered_at)}
              label={t('events.analytics.registrationTrend')}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('events.analytics.registrants')}
            </p>
            <ExportButton
              filename={`event-analytics-${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              title={t('events.analytics.exportTitle', { title: eventTitle })}
              headers={[
                t('events.analytics.table.name'),
                t('events.analytics.table.email'),
                t('events.analytics.table.role'),
                t('events.analytics.table.registeredAt'),
              ]}
              rows={(analytics.registrants || []).map((r) => [
                r?.full_name ?? '',
                r?.email ?? '',
                r?.role ?? '',
                formatRegistrationDate(r?.registered_at),
              ])}
              summaryLines={[
                `${t('events.analytics.totalRegistered')}: ${analytics.total_registered ?? 0} / ${analytics.capacity ?? 0}`,
                `${t('events.analytics.fillRate')}: ${Math.round((analytics.fill_rate ?? 0) * 100)}%`,
                ...(analytics.registrants_by_role || []).map((rb) => `${rb?.role ?? ''}: ${rb?.count ?? 0}`),
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}