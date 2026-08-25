import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import {
  useAuth,
  type MemberRecord,
  type PermissionRequestRecord,
} from '@/providers/AuthProvider';

export interface AccessControlProps {
  members: MemberRecord[];
  permissionRequests: PermissionRequestRecord[];
  onChanged: () => void;
}

export function AccessControl({ members, permissionRequests, onChanged }: AccessControlProps) {
  const { t } = useTranslation();
  const { updateAdminMember, grantPermissionRequest, denyPermissionRequest } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortValue, setSortValue] = useState('name');

  const filteredMembers = useMemo(() => {
    const items = [...members].filter((member) => {
      const statusMatches = statusFilter === 'all' || (statusFilter === 'active' ? member.is_active : !member.is_active);
      const roleMatches = roleFilter === 'all' || member.role.name === roleFilter;
      return statusMatches && roleMatches;
    });

    switch (sortValue) {
      case 'name-desc':
        return items.sort((a, b) => b.full_name.localeCompare(a.full_name));
      case 'created':
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'name':
      default:
        return items.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
  }, [members, roleFilter, sortValue, statusFilter]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredMembers, 5);

  async function handleGrant(requestId: string, name: string) {
    try {
      await grantPermissionRequest(requestId);
      toast.success(t('itHead.accessControl.grantedToast', { name }));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function handleDeny(requestId: string, name: string) {
    try {
      await denyPermissionRequest(requestId);
      toast.success(t('itHead.accessControl.deniedToast', { name }));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function handleToggleActive(member: MemberRecord) {
    try {
      await updateAdminMember(member.id, { is_active: !member.is_active });
      toast.success(
        member.is_active
          ? t('itHead.accessControl.deactivateToast', { name: member.full_name })
          : t('itHead.accessControl.reactivateToast', { name: member.full_name }),
      );
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('itHead.accessControl.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('itHead.accessControl.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.accessControl.filters.all') },
                { value: 'active', label: t('itHead.accessControl.filters.active') },
                { value: 'inactive', label: t('itHead.accessControl.filters.disabled') },
              ],
            },
            {
              label: t('itHead.accessControl.filters.roleLabel'),
              value: roleFilter,
              onChange: (value) => {
                setRoleFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.accessControl.filters.all') },
                ...Array.from(new Set(members.map((member) => member.role.name))).map((role) => ({
                  value: role,
                  label: t(`auth.login.roles.${role}`),
                })),
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sortValue,
            onChange: (value) => {
              setSortValue(value);
              setPage(1);
            },
            options: [
              { value: 'name', label: t('itHead.accessControl.sort.nameAsc') },
              { value: 'name-desc', label: t('itHead.accessControl.sort.nameDesc') },
              { value: 'created', label: t('itHead.accessControl.sort.newestFirst') },
            ],
          }}
          onReset={() => {
            setStatusFilter('all');
            setRoleFilter('all');
            setSortValue('name');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {filteredMembers.length === 0 ? (
          <NoResults title={t('itHead.accessControl.empty')} />
        ) : (
          <>
            {paginatedItems.map((member) => {
              const pendingRequest = permissionRequests.find(
                (request) => request.requested_by_id === member.id && request.status === 'pending',
              );

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{member.full_name}</p>
                      <Badge variant="outline">{t(`auth.login.roles.${member.role.name}`)}</Badge>
                      <Badge variant={member.is_active ? 'success' : 'danger'}>
                        {t(`itHead.accessControl.status.${member.is_active ? 'active' : 'deactivated'}`)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{member.email}</p>
                    {pendingRequest && (
                      <p className="text-xs text-muted-foreground">
                        {t('itHead.accessControl.pendingPermission', {
                          permission: pendingRequest.permission,
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {pendingRequest && (
                      <>
                        <Button size="sm" onClick={() => handleGrant(pendingRequest.id, member.full_name)}>
                          {t('itHead.accessControl.grantAccess')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeny(pendingRequest.id, member.full_name)}
                        >
                          {t('itHead.accessControl.deny')}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleToggleActive(member)}>
                      {member.is_active ? t('itHead.accessControl.deactivate') : t('itHead.accessControl.reactivate')}
                    </Button>
                  </div>
                </div>
              );
            })}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
