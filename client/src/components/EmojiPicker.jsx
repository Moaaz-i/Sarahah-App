import { useEffect, useRef, useState } from 'react';

const EMOJI_CATEGORIES = [
  {
    name: 'تعبيرات',
    icon: '😊',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '🥹', '😅', '😂', '🤣', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋', '😜',
      '🤪', '🤫', '🤗', '🫣', '🤔', '🫡', '😏', '🙄', '😬', '😴',
      '😷', '🥴', '😵', '🤯', '🥳', '😎', '🤓', '🥺', '😭', '😱',
      '😡', '🤬', '😈', '💀', '👻', '🤡',
    ],
  },
  {
    name: 'قلوب',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
    ],
  },
  {
    name: 'إيماءات',
    icon: '👍',
    emojis: [
      '👍', '👎', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '👊', '✊',
      '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '👈', '👉',
      '👆', '👇', '✋', '👋', '🤙', '🙏',
    ],
  },
  {
    name: 'رموز وتألق',
    icon: '✨',
    emojis: [
      '✨', '⭐', '🌟', '💫', '🔥', '💥', '💯', '💬', '💭', '💌',
      '💎', '👑', '🏆', '🎯', '🚀', '🎉', '🎊', '🎁', '🌹', '🌸',
      '🍀', '🕊️', '🧿',
    ],
  },
];

export const QUICK_EMOJIS = ['❤️', '😂', '🔥', '👍', '👏', '🥺', '😍', '✨', '🎉', '🙏'];

/**
 * Quick inline emoji bar for rapid tapping
 */
export function QuickEmojiBar({ onSelect, disabled = false }) {
  return (
    <div className="quick-emoji-bar" role="toolbar" aria-label="إيموجيات سريعة">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="quick-emoji-btn"
          disabled={disabled}
          onClick={() => onSelect(emoji)}
          title={`إدراج ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/**
 * Dropdown / Popover Emoji Picker
 */
export default function EmojiPicker({ onSelect, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const pickerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (emoji) => {
    onSelect(emoji);
  };

  return (
    <div className="emoji-picker-container" ref={pickerRef}>
      <button
        type="button"
        className={`emoji-trigger-btn ${open ? 'emoji-trigger-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="إدراج إيموجي 😊"
        aria-label="لوحة الإيموجي"
        aria-expanded={open}
      >
        😊
      </button>

      {open && (
        <div className="emoji-popover" role="dialog" aria-label="اختيار إيموجي">
          <div className="emoji-tabs">
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <button
                key={cat.name}
                type="button"
                className={`emoji-tab ${activeTab === idx ? 'emoji-tab--active' : ''}`}
                onClick={() => setActiveTab(idx)}
                title={cat.name}
              >
                <span>{cat.icon}</span>
                <span className="emoji-tab-label">{cat.name}</span>
              </button>
            ))}
          </div>

          <div className="emoji-grid">
            {EMOJI_CATEGORIES[activeTab].emojis.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                type="button"
                className="emoji-grid-btn"
                onClick={() => handleSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

