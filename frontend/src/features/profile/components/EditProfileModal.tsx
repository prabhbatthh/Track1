import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Avatar, Button, Input, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { editProfileSchema, type EditProfileFormValues } from '@/lib/authSchema';
import { getAvatarPresets } from '@/lib/avatarPresets';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';

export interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { t } = useTranslation();
  const { fullName, phone, avatarUrl, role, updateProfile } = useAuth();
  const [selectedAvatar, setSelectedAvatar] = useState<string | undefined>(avatarUrl ?? undefined);
  const presets = role ? getAvatarPresets(role) : [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    values: {
      fullName: fullName ?? '',
      phoneNumber: phone ?? '',
    },
  });

  async function onSubmit(values: EditProfileFormValues) {
    try {
      await updateProfile({
        full_name: values.fullName,
        phone: values.phoneNumber,
        avatar_url: selectedAvatar,
      });
      toast.success('Profile updated');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update profile'));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('profile.editProfile')}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col items-center gap-3">
          <Avatar src={selectedAvatar} name={fullName ?? undefined} size="lg" />
          <div className="flex flex-wrap justify-center gap-2">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSelectedAvatar(preset)}
                aria-label="Choose this avatar"
                className={cn(
                  'size-9 overflow-hidden rounded-full ring-offset-2 ring-offset-surface transition',
                  selectedAvatar === preset ? 'ring-2 ring-primary' : 'hover:opacity-80',
                )}
              >
                <img src={preset} alt="" className="size-full" />
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Full name"
          autoComplete="name"
          error={errors.fullName?.message ? t(errors.fullName.message) : undefined}
          {...register('fullName')}
        />
        <Input
          label="Phone number"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          error={errors.phoneNumber?.message ? t(errors.phoneNumber.message) : undefined}
          {...register('phoneNumber')}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
