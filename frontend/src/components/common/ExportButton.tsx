import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { getErrorMessage } from '@/lib/api';
import { downloadCsv, downloadPdf, type ExportCell } from '@/lib/export';

export interface ExportButtonProps {
  /** File name without extension — ".csv"/".pdf" is appended per format. */
  filename: string;
  /** Heading printed at the top of the PDF. */
  title: string;
  headers: string[];
  /** Either the rows to export directly, or a loader that fetches them on click
   * (e.g. a full month's data, independent of whatever page is currently on screen). */
  rows: ExportCell[][] | (() => Promise<ExportCell[][]>);
  /** Optional lines (e.g. key metrics) printed above the table in both CSV and PDF exports. */
  summaryLines?: string[];
  className?: string;
}

export function ExportButton({
  filename,
  title,
  headers,
  rows,
  summaryLines = [],
  className,
}: ExportButtonProps) {
  const { t } = useTranslation();
  const [loadingFormat, setLoadingFormat] = useState<'csv' | 'pdf' | null>(null);

  async function resolveRows(): Promise<ExportCell[][]> {
    return typeof rows === 'function' ? rows() : rows;
  }

  async function handleExport(format: 'csv' | 'pdf') {
    setLoadingFormat(format);
    try {
      const resolvedRows = await resolveRows();
      if (format === 'csv') {
        downloadCsv(`${filename}.csv`, headers, resolvedRows, summaryLines);
      } else {
        await downloadPdf(`${filename}.pdf`, title, headers, resolvedRows, summaryLines);
      }
    } catch (err) {
      console.error('[Export error]:', err);
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setLoadingFormat(null);
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        leadingIcon={<Download className="size-3.5" />}
        isLoading={loadingFormat === 'csv'}
        disabled={loadingFormat !== null && loadingFormat !== 'csv'}
        onClick={() => handleExport('csv')}
      >
        {t('common.export.csv')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        leadingIcon={<Download className="size-3.5" />}
        isLoading={loadingFormat === 'pdf'}
        disabled={loadingFormat !== null && loadingFormat !== 'pdf'}
        onClick={() => handleExport('pdf')}
      >
        {t('common.export.pdf')}
      </Button>
    </div>
  );
}