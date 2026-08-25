export type ExportCell = string | number;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvField(field: ExportCell): string {
  const value = String(field);
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: ExportCell[][],
  summaryLines: string[] = [],
): void {
  const dataLines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(','));
  const lines = summaryLines.length > 0 ? [...summaryLines, '', ...dataLines] : dataLines;
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

interface JsPDFModule {
  jsPDF?: new () => unknown;
  default?: new () => unknown;
}

interface AutoTableModule {
  default?: (doc: unknown, options: unknown) => void;
  autoTable?: (doc: unknown, options: unknown) => void;
}

interface AutoTableDoc {
  text: (text: string, x: number, y: number) => void;
  setFontSize: (size: number) => void;
  save: (filename: string) => void;
  autoTable?: (options: unknown) => void;
}

// ponytail: jspdf + jspdf-autotable are ~400kb and only needed once someone actually
// clicks "export PDF" — loaded on demand so they stay out of the initial bundle.
export async function downloadPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: ExportCell[][],
  summaryLines: string[] = [],
): Promise<void> {
  const [jsPDFModule, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const jsPDFConstructor =
    (jsPDFModule as unknown as JsPDFModule).jsPDF ||
    (jsPDFModule as unknown as JsPDFModule).default ||
    (jsPDFModule as unknown as new () => AutoTableDoc);

  const autoTable =
    typeof (autoTableModule as unknown as AutoTableModule).default === 'function'
      ? (autoTableModule as unknown as AutoTableModule).default
      : typeof (autoTableModule as unknown as AutoTableModule).autoTable === 'function'
      ? (autoTableModule as unknown as AutoTableModule).autoTable
      : typeof autoTableModule === 'function'
      ? (autoTableModule as unknown as (doc: unknown, options: unknown) => void)
      : null;

  const doc = new jsPDFConstructor() as unknown as AutoTableDoc;
  doc.text(String(title || ''), 14, 16);

  let startY = 22;
  if (summaryLines && summaryLines.length > 0) {
    doc.setFontSize(10);
    summaryLines.forEach((line, i) => {
      doc.text(String(line ?? ''), 14, startY + i * 5);
    });
    doc.setFontSize(12);
    startY += summaryLines.length * 5 + 4;
  }

  const safeRows = (rows || []).map((row) =>
    (row || []).map((cell) => (cell == null ? '' : String(cell))),
  );

  if (typeof autoTable === 'function') {
    autoTable(doc, {
      head: [headers || []],
      body: safeRows,
      startY,
    });
  } else if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      head: [headers || []],
      body: safeRows,
      startY,
    });
  }

  doc.save(filename);
}