import { useTranslation } from 'react-i18next';

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { ChildVisitStatus } from '@/providers/AuthProvider';

export function ChildrenPresence({ children }: { children: ChildVisitStatus[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('guardian.presence.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {children.length === 0 ? (
          <EmptyState
            title={t('guardian.presence.emptyTitle')}
            description={t('guardian.presence.emptyDescription')}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {children.map((child) => {
              const statusText = child.is_in_library
                ? 'In library'
                : child.last_checked_out_at
                ? 'Left'
                : 'Not in library';
              const subtitle = child.is_in_library && child.checked_in_at
                ? `Checked in at ${formatDate(child.checked_in_at)}`
                : child.last_checked_out_at
                ? `Left at ${formatDate(child.last_checked_out_at)}`
                : 'Not in library';

              return (
                <li
                  key={child.child_id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{child.child_name}</p>
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                  </div>
                  <Badge variant={child.is_in_library ? 'success' : 'outline'}>
                    {statusText}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
