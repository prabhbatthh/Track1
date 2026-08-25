import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadCsv, downloadPdf } from './export';

vi.mock('html2canvas', () => ({
  default: vi.fn((element, options) => {
    if (options?.onclone) {
      const clonedDoc = document.cloneNode(true) as Document;
      const clonedEl = element.cloneNode(true) as HTMLElement;
      options.onclone(clonedDoc, clonedEl);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    return Promise.resolve(canvas);
  }),
}));

vi.mock('jspdf', () => {
  const saveMock = vi.fn();
  const textMock = vi.fn();
  const addImageMock = vi.fn();
  const setFontSizeMock = vi.fn();
  const getWidthMock = vi.fn().mockReturnValue(210);

  function MockJsPDF(this: Record<string, unknown>) {
    this.text = textMock;
    this.setFontSize = setFontSizeMock;
    this.addImage = addImageMock;
    this.save = saveMock;
    this.internal = {
      pageSize: {
        getWidth: getWidthMock,
      },
    };
  }

  return { jsPDF: MockJsPDF };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

// jsdom's Blob doesn't implement .text(), so read it back via FileReader instead.
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

interface Captured {
  blob: Blob | null;
  filename: string | null;
  getBlob: () => Blob;
}

function captureDownloadedBlob(): Captured {
  const result: Captured = {
    blob: null,
    filename: null,
    getBlob() {
      if (this.blob === null) throw new Error('No blob was captured');
      return this.blob;
    },
  };

  vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
    result.blob = obj as Blob;
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  const origCreateElement = document.createElement.bind(document);
  const anchor = origCreateElement('a');
  vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    if (tag === 'a') {
      Object.defineProperty(anchor, 'download', {
        get() {
          return result.filename ?? '';
        },
        set(value: string) {
          result.filename = value;
        },
      });
      return anchor;
    }
    return origCreateElement(tag, options);
  });

  return result;
}

describe('downloadCsv', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('joins headers and rows with commas and newlines', async () => {
    const captured = captureDownloadedBlob();

    downloadCsv('payments.csv', ['Label', 'Amount'], [['Membership', 499]]);

    expect(captured.filename).toBe('payments.csv');
    const text = await readBlobAsText(captured.getBlob());
    expect(text).toBe('Label,Amount\nMembership,499');
  });

  it('escapes fields containing commas, quotes, or newlines', async () => {
    const captured = captureDownloadedBlob();

    downloadCsv('payments.csv', ['Label'], [['Say "hi", friend\nagain']]);

    const text = await readBlobAsText(captured.getBlob());
    expect(text).toBe('Label\n"Say ""hi"", friend\nagain"');
  });
});

describe('downloadPdf', () => {
  it('creates PDF with headers, rows, and summary lines without throwing', async () => {
    await expect(
      downloadPdf(
        'registrants.pdf',
        'Registrants List',
        ['Name', 'Email', 'Role'],
        [['Alice', 'alice@example.com', 'admin']],
        ['Total: 1'],
      ),
    ).resolves.not.toThrow();
  });

  it('handles empty rows and null/undefined values gracefully', async () => {
    await expect(
      downloadPdf('registrants.pdf', 'Registrants List', ['Name'], []),
    ).resolves.not.toThrow();
  });
});
