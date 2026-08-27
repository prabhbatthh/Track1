import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common';
import { GuardianAutopaySimulator } from '../components/GuardianAutopaySimulator';

export function GuardianAutopayPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.guardianAutopay', 'AI Guardian Auto-Pay')}
        description="Autonomous fine settlement policy controls, spending caps, and trust-based safety engine"
      />
      <GuardianAutopaySimulator />
    </div>
  );
}

export default GuardianAutopayPage;
