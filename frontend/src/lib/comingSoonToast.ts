import { toast } from 'sonner';

export function comingSoonToast(action: string) {
  toast.info(`${action} isn't wired up yet`, {
    description: 'This is a UI preview — the real workflow ships once the backend is connected.',
  });
}
