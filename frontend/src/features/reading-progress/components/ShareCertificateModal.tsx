import { Download, Share2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Modal } from '@/components/ui';

const WIDTH = 1200;
const HEIGHT = 630;
const FILE_NAME = 'reading-certificate.png';

const canShareFile = Boolean(
  typeof navigator !== 'undefined' &&
    navigator.canShare?.({ files: [new File([], FILE_NAME, { type: 'image/png' })] }),
);

export interface ShareCertificateModalProps {
  open: boolean;
  onClose: () => void;
  memberName: string;
  count: number;
  goal: number;
  periodLabel: string;
}

// ponytail: drawn with the Canvas 2D API rather than a DOM-to-image library
// (html2canvas etc.) — it's one static, fully-controlled layout, not an arbitrary
// screenshot of the page, so plain canvas calls are simpler and add zero dependencies.
function draw(canvas: HTMLCanvasElement, opts: ShareCertificateModalProps) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#731c7b');
  gradient.addColorStop(1, '#4a044e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft decorative circles, in the same spirit as the marketing page's blob accents.
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.arc(WIDTH - 120, -40, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-60, HEIGHT + 40, 200, 0, Math.PI * 2);
  ctx.fill();

  // Certificate border.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, WIDTH - 56, HEIGHT - 56);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '80px sans-serif';
  ctx.fillText('🏆', WIDTH / 2, 200);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px Inter, sans-serif';
  ctx.fillText('Reading Challenge Completed!', WIDTH / 2, 270);

  // Shrink the name to fit if it's long, rather than letting it clip or overflow.
  let nameSize = 56;
  ctx.font = `700 ${nameSize}px Inter, sans-serif`;
  while (ctx.measureText(opts.memberName).width > WIDTH - 200 && nameSize > 28) {
    nameSize -= 4;
    ctx.font = `700 ${nameSize}px Inter, sans-serif`;
  }
  ctx.fillText(opts.memberName, WIDTH / 2, 360);

  ctx.font = '32px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(`${opts.count} of ${opts.goal} books · ${opts.periodLabel}`, WIDTH / 2, 420);

  ctx.font = '24px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Community Reading Club', WIDTH / 2, HEIGHT - 60);
}

export function ShareCertificateModal(props: ShareCertificateModalProps) {
  const { open, onClose } = props;
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Wait for the app's web font so the certificate doesn't render one frame in a
    // fallback serif/sans before Inter is ready — this canvas paints once, not per-frame.
    document.fonts.ready.then(() => draw(canvas, props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.memberName, props.count, props.goal, props.periodLabel]);

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => canvasRef.current?.toBlob(resolve, 'image/png'));
  }

  async function handleDownload() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], FILE_NAME, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: t('readingProgress.certificate.title') });
    } catch {
      // User cancelled the native share sheet — not an error worth surfacing.
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('readingProgress.certificate.title')}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          {canShareFile && (
            <Button variant="outline" leadingIcon={<Share2 className="size-4" />} onClick={handleShare}>
              {t('readingProgress.certificate.share')}
            </Button>
          )}
          <Button leadingIcon={<Download className="size-4" />} onClick={handleDownload}>
            {t('readingProgress.certificate.download')}
          </Button>
        </>
      }
    >
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="w-full rounded-md" />
    </Modal>
  );
}
