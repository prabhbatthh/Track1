import { useState } from 'react';

import { ListRow } from '@/components/common';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useDebouncedFetch } from '@/lib/useDebouncedFetch';
import { useAuth, type MemberSummary } from '@/providers/AuthProvider';

export interface MemberPickerProps {
  selectedMember: MemberSummary | null;
  onSelect: (member: MemberSummary | null) => void;
  label: string;
  searchPlaceholder: string;
  changeLabel: string;
  noResultsLabel: string;
  autoFocus?: boolean;
  /** Restrict results to an exact role, e.g. 'member' or 'guardian'. */
  role?: string;
  /** Restrict results to active accounts only. */
  activeOnly?: boolean;
  className?: string;
}

// Shared member search-and-select used across manager counter actions (billing
// requests, booking a seat / issuing a book on a member's behalf, linking a guardian).
export function MemberPicker({
  selectedMember,
  onSelect,
  label,
  searchPlaceholder,
  changeLabel,
  noResultsLabel,
  autoFocus,
  role,
  activeOnly,
  className,
}: MemberPickerProps) {
  const { searchMembers } = useAuth();
  const [query, setQuery] = useState('');
  const { data: results, isLoading, error, refresh } = useDebouncedFetch<MemberSummary[]>(
    () => searchMembers(query, { role, activeOnly }),
    [query, role, activeOnly],
    [],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {selectedMember ? (
        <ListRow
          title={selectedMember.full_name}
          subtitle={selectedMember.email}
          action={
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {changeLabel}
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus={autoFocus}
            className="bg-surface"
          />
          {isLoading && (
            <p className="px-1 text-xs text-muted-foreground" role="status">
              Searching members…
            </p>
          )}
          {Boolean(error) && !isLoading && (
            <div className="flex items-center justify-between gap-2 px-1" role="alert">
              <p className="text-xs text-danger">Could not load members.</p>
              <Button size="sm" variant="outline" onClick={refresh}>
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !error && results.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-panel">
              {results.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(member);
                      setQuery('');
                    }}
                    className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-secondary"
                  >
                    <span className="text-sm font-medium text-foreground">{member.full_name}</span>
                    <span className="text-xs text-muted-foreground">{member.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!isLoading && !error && query.trim().length > 0 && results.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">{noResultsLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}
