import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Logo from './Logo.jsx';
import { useToast } from './Toast.jsx';
import { relativeTime } from '../lib/format.js';
import { identityClueOf } from '../lib/feedback.js';

const THEMES = [
  {
    id: 'cosmic',
    name: 'ليلي كوني',
    bg: 'linear-gradient(135deg, #180b38 0%, #291254 50%, #0d0a21 100%)',
    accent: '#a855f7',
    border: 'rgba(168, 85, 247, 0.35)',
    cardBg: 'rgba(25, 17, 49, 0.85)',
    replyBg: 'rgba(168, 85, 247, 0.18)',
    replyBorder: 'rgba(168, 85, 247, 0.4)',
    textColor: '#ffffff',
    subColor: '#c084fc',
    canvasBgStart: '#180b38',
    canvasBgEnd: '#0d0a21',
  },
  {
    id: 'cyberpunk',
    name: 'نيون سيبراني',
    bg: 'linear-gradient(135deg, #10061e 0%, #22083d 50%, #06020c 100%)',
    accent: '#facc15',
    border: 'rgba(250, 204, 21, 0.35)',
    cardBg: 'rgba(26, 12, 48, 0.85)',
    replyBg: 'rgba(250, 204, 21, 0.15)',
    replyBorder: 'rgba(250, 204, 21, 0.4)',
    textColor: '#ffffff',
    subColor: '#fde047',
    canvasBgStart: '#10061e',
    canvasBgEnd: '#06020c',
  },
  {
    id: 'sunset',
    name: 'شفق الغروب',
    bg: 'linear-gradient(135deg, #43122f 0%, #701a3d 50%, #1f0718 100%)',
    accent: '#f43f5e',
    border: 'rgba(244, 63, 94, 0.35)',
    cardBg: 'rgba(49, 14, 32, 0.85)',
    replyBg: 'rgba(244, 63, 94, 0.18)',
    replyBorder: 'rgba(244, 63, 94, 0.4)',
    textColor: '#ffffff',
    subColor: '#fb7185',
    canvasBgStart: '#43122f',
    canvasBgEnd: '#1f0718',
  },
  {
    id: 'aurora',
    name: 'شفق قطبي',
    bg: 'linear-gradient(135deg, #031c26 0%, #083c48 50%, #021217 100%)',
    accent: '#2dd4bf',
    border: 'rgba(45, 212, 191, 0.35)',
    cardBg: 'rgba(6, 36, 44, 0.85)',
    replyBg: 'rgba(45, 212, 191, 0.18)',
    replyBorder: 'rgba(45, 212, 191, 0.4)',
    textColor: '#ffffff',
    subColor: '#5eead4',
    canvasBgStart: '#031c26',
    canvasBgEnd: '#021217',
  },
  {
    id: 'emerald',
    name: 'محيط زمردي',
    bg: 'linear-gradient(135deg, #062b28 0%, #0c4a44 50%, #031715 100%)',
    accent: '#10b981',
    border: 'rgba(16, 185, 129, 0.35)',
    cardBg: 'rgba(8, 38, 35, 0.85)',
    replyBg: 'rgba(16, 185, 129, 0.18)',
    replyBorder: 'rgba(16, 185, 129, 0.4)',
    textColor: '#ffffff',
    subColor: '#34d399',
    canvasBgStart: '#062b28',
    canvasBgEnd: '#031715',
  },
  {
    id: 'onyx',
    name: 'فحم نيون',
    bg: 'linear-gradient(135deg, #0e1118 0%, #171d2b 50%, #08090d 100%)',
    accent: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.35)',
    cardBg: 'rgba(15, 20, 31, 0.85)',
    replyBg: 'rgba(56, 189, 248, 0.18)',
    replyBorder: 'rgba(56, 189, 248, 0.4)',
    textColor: '#ffffff',
    subColor: '#7dd3fc',
    canvasBgStart: '#0e1118',
    canvasBgEnd: '#08090d',
  },
];

export default function StoryCardModal({ open, onClose, message, username }) {
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [replyText, setReplyText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const cardRef = useRef(null);

  useEffect(() => {
    if (message?.publicReply) {
      setReplyText(message.publicReply);
    } else {
      setReplyText('');
    }
  }, [message]);

  if (!open || !message) return null;

  const clue = identityClueOf(message.identityClue);
  const messageText = message.content || (message.voiceUrl ? 'رسالة صوتية مجهولة 🎙️' : 'رسالة صريحة مجهولة');

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      toast.success('تم نسخ نص الرسالة!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذر نسخ النص');
    }
  };

  const drawRoundRect = (ctx, x, y, w, h, r) => {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
  };

  const renderAndDownload = () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const width = 1080;
      const height = 1350; // High-res 4:5 social card
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // 1. Background gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, selectedTheme.canvasBgStart);
      grad.addColorStop(1, selectedTheme.canvasBgEnd);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle glow circle in top right
      const glow = ctx.createRadialGradient(width * 0.8, height * 0.15, 10, width * 0.8, height * 0.15, 450);
      glow.addColorStop(0, selectedTheme.accent + '33');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // 2. Inner card container
      const cardX = 90;
      const cardY = 120;
      const cardW = width - 180;
      const cardH = height - 240;
      const radius = 36;

      ctx.save();
      ctx.beginPath();
      drawRoundRect(ctx, cardX, cardY, cardW, cardH, radius);
      ctx.fillStyle = selectedTheme.cardBg;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = selectedTheme.border;
      ctx.stroke();
      ctx.restore();

      // 3. Header inside card: Logo & Brand
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';

      ctx.fillStyle = selectedTheme.textColor;
      ctx.font = 'bold 44px Cairo, Segoe UI, sans-serif';
      ctx.fillText('صارحني', width - cardX - 70, cardY + 95);

      ctx.fillStyle = selectedTheme.subColor;
      ctx.font = '500 28px Cairo, Segoe UI, sans-serif';
      ctx.fillText(`@${username || 'sarhny'}`, width - cardX - 70, cardY + 145);

      // Left side badge with Identity Clue
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.fillStyle = selectedTheme.subColor;
      ctx.font = '600 24px Cairo, Segoe UI, sans-serif';
      const clueLabel = clue && clue.key !== 'none' ? `${clue.icon} ${clue.label}` : 'رسالة صريحة مجهولة ✉️';
      ctx.fillText(clueLabel, cardX + 70, cardY + 115);

      // Divider line
      ctx.beginPath();
      ctx.moveTo(cardX + 60, cardY + 185);
      ctx.lineTo(width - cardX - 60, cardY + 185);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4. Message Content (RTL word wrapped)
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = selectedTheme.textColor;

      const words = messageText.split(/\s+/);
      const hasReply = Boolean(replyText.trim());
      let fontSize = hasReply ? 34 : 42;
      if (messageText.length > 250) fontSize = 28;
      else if (messageText.length > 140) fontSize = 32;

      ctx.font = `600 ${fontSize}px Cairo, Segoe UI, sans-serif`;
      const lineHeight = fontSize * 1.6;
      const maxTextWidth = cardW - 140;
      let line = '';
      const lines = [];

      for (let n = 0; n < words.length; n++) {
        const testLine = line + (line ? ' ' : '') + words[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxTextWidth && n > 0) {
          lines.push(line);
          line = words[n];
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      let textY = cardY + 270;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], width - cardX - 70, textY);
        textY += lineHeight;
      }

      // 5. Draw Recipient's Reply Box if present
      if (hasReply) {
        textY += 40;
        const replyW = cardW - 120;
        const replyX = cardX + 60;
        const replyPadding = 32;

        const replyWords = replyText.trim().split(/\s+/);
        const replyFontSize = 30;
        ctx.font = `500 ${replyFontSize}px Cairo, Segoe UI, sans-serif`;
        const replyLineHeight = replyFontSize * 1.5;
        const maxReplyTextWidth = replyW - replyPadding * 2;
        let rLine = '';
        const rLines = [];

        for (let n = 0; n < replyWords.length; n++) {
          const testLine = rLine + (rLine ? ' ' : '') + replyWords[n];
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxReplyTextWidth && n > 0) {
            rLines.push(rLine);
            rLine = replyWords[n];
          } else {
            rLine = testLine;
          }
        }
        rLines.push(rLine);

        const replyBoxH = 70 + rLines.length * replyLineHeight + replyPadding;

        // Draw reply box
        ctx.save();
        ctx.beginPath();
        drawRoundRect(ctx, replyX, textY, replyW, replyBoxH, 24);
        ctx.fillStyle = selectedTheme.replyBg;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = selectedTheme.replyBorder;
        ctx.stroke();
        ctx.restore();

        // Reply Title
        ctx.fillStyle = selectedTheme.accent;
        ctx.font = 'bold 26px Cairo, Segoe UI, sans-serif';
        ctx.fillText(`👑 ردي (@${username || 'أنا'}):`, width - cardX - 95, textY + 45);

        // Reply Text
        ctx.fillStyle = selectedTheme.textColor;
        ctx.font = `500 ${replyFontSize}px Cairo, Segoe UI, sans-serif`;
        let rTextY = textY + 95;
        for (let i = 0; i < rLines.length; i++) {
          ctx.fillText(rLines[i], width - cardX - 95, rTextY);
          rTextY += replyLineHeight;
        }
      }

      // 6. Footer inside card
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '400 24px Cairo, Segoe UI, sans-serif';
      ctx.fillText(relativeTime(message.createdAt), width - cardX - 70, cardY + cardH - 60);

      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.fillStyle = selectedTheme.subColor;
      ctx.font = '700 24px Cairo, Segoe UI, sans-serif';
      ctx.fillText('sarhny.app', cardX + 70, cardY + cardH - 60);

      // Download as PNG
      const link = document.createElement('a');
      link.download = `sarhny-story-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('تم إنشاء وتحميل صورة البطاقة بنجاح!');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ الصورة');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal open={open} title="مشاركة الرسالة كبطاقة ستوري" onClose={onClose} width={580}>
      <div className="story-modal">
        {/* Reply Input Box */}
        <div className="story-modal__reply-field">
          <label className="field__label" htmlFor="story-reply-input">
            ردك على الرسالة (سيظهر داخل صورة الستوري):
          </label>
          <input
            id="story-reply-input"
            type="text"
            className="composer__input"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value.slice(0, 200))}
            placeholder="اكتب ردك هنا… مثل: (شكرًا لك كلامك أسعدني جدًا ❤️)"
            maxLength={200}
          />
        </div>

        {/* Theme Picker */}
        <div className="story-modal__themes">
          <label className="story-modal__themes-label">اختر مظهر البطاقة:</label>
          <div className="story-modal__palette" role="radiogroup" aria-label="اختر مظهر البطاقة">
            {THEMES.map((theme) => {
              const isSelected = selectedTheme.id === theme.id;
              return (
                <label
                  key={theme.id}
                  className={`story-theme-btn ${isSelected ? 'is-active' : ''}`}
                  style={{
                    background: theme.bg,
                    borderColor: isSelected ? theme.accent : 'rgba(255, 255, 255, 0.15)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="story-theme"
                    value={theme.id}
                    checked={isSelected}
                    onChange={() => setSelectedTheme(theme)}
                  />
                  <span>{theme.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Live Card Preview */}
        <div
          ref={cardRef}
          className="story-card-preview"
          style={{
            background: selectedTheme.bg,
            boxShadow: `0 20px 40px rgba(0,0,0,0.5), inset 0 0 0 1px ${selectedTheme.border}`,
          }}
        >
          <div
            className="story-card-preview__inner"
            style={{
              background: selectedTheme.cardBg,
              borderColor: selectedTheme.border,
            }}
          >
            <div className="story-card-preview__head">
              <div className="story-card-preview__brand">
                <Logo size={28} showText={false} />
                <div>
                  <h4 style={{ color: selectedTheme.textColor }}>صارحني</h4>
                  <span style={{ color: selectedTheme.subColor }}>@{username || 'sarhny'}</span>
                </div>
              </div>
              <span className="story-card-preview__tag" style={{ color: selectedTheme.subColor }}>
                {clue && clue.key !== 'none' ? `${clue.icon} ${clue.label}` : 'رسالة مجهولة ✉️'}
              </span>
            </div>

            <div className="story-card-preview__body" style={{ color: selectedTheme.textColor }}>
              <span className="story-card-preview__quote" style={{ color: selectedTheme.accent }}>
                “
              </span>
              <p>{messageText}</p>
            </div>

            {/* Live Reply Preview */}
            {replyText.trim() && (
              <div
                className="story-card-preview__reply"
                style={{
                  background: selectedTheme.replyBg,
                  borderColor: selectedTheme.replyBorder,
                }}
              >
                <div className="story-card-preview__reply-author" style={{ color: selectedTheme.accent }}>
                  👑 ردي (@{username || 'أنا'}):
                </div>
                <p style={{ color: selectedTheme.textColor }}>{replyText}</p>
              </div>
            )}

            <div className="story-card-preview__footer">
              <span style={{ color: selectedTheme.subColor }}>sarhny.app</span>
              <time style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                {relativeTime(message.createdAt)}
              </time>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="story-modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={renderAndDownload}
            disabled={downloading}
          >
            {downloading ? 'جارٍ توليد الصورة…' : '📥 تحميل البطاقة كصورة (PNG)'}
          </button>
          <button
            type="button"
            className={`btn ${copied ? 'btn--ok' : 'btn--ghost'}`}
            onClick={copyText}
          >
            {copied ? '✓ تم النسخ' : '📋 نسخ نص الرسالة'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
