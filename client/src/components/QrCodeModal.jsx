import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { useToast } from './Toast.jsx';

export default function QrCodeModal({ open, onClose, user, profileUrl }) {
  const [dataUrl, setDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const canvasRef = useRef(null);

  const finalUrl = profileUrl || (typeof window !== 'undefined' ? window.location.href : '');

  useEffect(() => {
    if (!open || !finalUrl) return;

    // 1. Render directly to canvas
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        finalUrl,
        {
          width: 260,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        },
        (err) => {
          if (err) console.error('Canvas QR error:', err);
        },
      );
    }

    // 2. Also generate dataUrl for direct download
    QRCode.toDataURL(finalUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        setDataUrl(url);
      })
      .catch((err) => {
        console.error('DataURL QR error:', err);
      });
  }, [open, finalUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(finalUrl);
      setCopied(true);
      toast.success('تم نسخ الرابط بنجاح!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('تعذر نسخ الرابط تلقائيًا');
    }
  };

  const downloadQr = () => {
    let urlToDownload = dataUrl;
    if (!urlToDownload && canvasRef.current) {
      urlToDownload = canvasRef.current.toDataURL('image/png');
    }
    if (!urlToDownload) return;

    const link = document.createElement('a');
    link.download = `sarhny-qr-${user?.username || 'profile'}.png`;
    link.href = urlToDownload;
    link.click();
    toast.success('تم تحميل رمز الـ QR بنجاح!');
  };

  const shareWhatsapp = () => {
    const text = encodeURIComponent(`صارحني برسالة سرية ومجهولة تمامًا بدون أن أعرف من أنت:\n${finalUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const shareTwitter = () => {
    const text = encodeURIComponent(`أستقبل رسائلكم الصريحة والمجهولة عبر صارحني:\n${finalUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const shareTelegram = () => {
    const text = encodeURIComponent(`صارحني برسالة سرية مجهولة:\n${finalUrl}`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(finalUrl)}&text=${text}`, '_blank');
  };

  if (!open) return null;

  return (
    <Modal open={open} title="مشاركة رابط صفحتك ورمز QR" onClose={onClose} width={460}>
      <div className="qr-modal">
        {/* User Badge Above QR */}
        <div className="qr-modal__user-card">
          <Avatar src={user?.avatar} name={user?.name} username={user?.username} size={48} />
          <div>
            <h4 className="qr-modal__name">{user?.name}</h4>
            <span className="qr-modal__handle">@{user?.username}</span>
          </div>
        </div>

        {/* Clean, 100% Scannable QR Frame without obstructions */}
        <div className="qr-modal__frame">
          <canvas ref={canvasRef} className="qr-modal__canvas" width={260} height={260} />
        </div>

        <p className="qr-modal__hint">
          امسح الرمز بكاميرا الجوال للانتقال لصفحتك مباشرة، أو حمّل الصورة لمشاركتها في ستوري أو منشور.
        </p>

        {/* Link Copy Box */}
        <div className="qr-modal__link-box">
          <input type="text" readOnly value={finalUrl} className="qr-modal__input" />
          <button
            type="button"
            className={`btn ${copied ? 'btn--ok' : 'btn--primary'} btn--sm`}
            onClick={copyLink}
          >
            {copied ? '✓ تم النسخ' : 'نسخ'}
          </button>
        </div>

        {/* Download & Social Share Buttons */}
        <div className="qr-modal__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={downloadQr}>
            📥 تحميل كصورة QR عالية الدقة
          </button>
          <div className="qr-modal__socials">
            <button
              type="button"
              className="btn btn--ghost btn--sm qr-btn--whatsapp"
              onClick={shareWhatsapp}
              title="مشاركة عبر واتساب"
            >
              واتساب
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm qr-btn--twitter"
              onClick={shareTwitter}
              title="مشاركة عبر X"
            >
              منصة X
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm qr-btn--telegram"
              onClick={shareTelegram}
              title="مشاركة عبر تيليجرام"
            >
              تيليجرام
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
