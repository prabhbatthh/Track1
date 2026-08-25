import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, Badge, Button } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

import { EditProfileModal } from './EditProfileModal';

export interface ProfileHeaderProps {
  name: string;
  email?: string;
  joinDate?: string;
  /** The member's current plan label (e.g. "1 Month — ₹499"), from a real Payment record. */
  planLabel?: string;
  /** Staff roles show this badge instead of a membership plan (e.g. "Admin"). */
  roleLabel?: string;
}

export function ProfileHeader({ name, email, joinDate, planLabel, roleLabel }: ProfileHeaderProps) {
  const { t } = useTranslation();
  const { avatarUrl } = useAuth();
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl ?? undefined} name={name} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
          {email && <p className="text-sm text-muted-foreground">{email}</p>}
          {(roleLabel || planLabel) && (
            <div className="mt-2 flex items-center gap-2">
              {roleLabel ? (
                <Badge variant="outline">{roleLabel}</Badge>
              ) : (
                <Badge variant="success">{planLabel}</Badge>
              )}
              {joinDate && (
                <span className="text-xs text-muted-foreground">
                  {t('common.time.since', { date: joinDate })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <Button variant="outline" onClick={() => setEditing(true)}>
        {t('profile.editProfile')}
      </Button>

      <EditProfileModal open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
