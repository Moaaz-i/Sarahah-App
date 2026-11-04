import { useState } from 'react';
import FireCanvas from './FireCanvas.jsx';

const toArabicDigits = (num) => {
  if (num === null || num === undefined) return '٠';
  return String(num).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
};

export default function FlameStreakBanner({ totalMessages = 0, unreadCount = 0, forceShow = false }) {
  const [collapsed, setCollapsed] = useState(false);

  // Determine flame intensity level
  const count = totalMessages;
  const isHot = forceShow || count >= 5 || unreadCount >= 3;

  if (!isHot) return null;

  let levelText = 'صندوقك يشتعل بالحماس!';
  let descText = 'تفاعل رائع وإقبال متزايد على رسائل صفحتك الصريحة.';
  let intensity = 1.0;

  if (count >= 20) {
    levelText = 'لهيب الصراحة الأسطوري!';
    descText = 'صندوقك في قمة الاشتعال! تفاعل استثنائي وشعبية جارفة لا تتوقف.';
    intensity = 1.4;
  } else if (count >= 10) {
    levelText = 'شعلة التفاعل في أوجها!';
    descText = 'صندوقك يشتعل بالصراحة والرسائل المتتالية! تفاعل ملحوظ ومبهر.';
    intensity = 1.2;
  }

  return (
    <div className="flame-banner">
      {/* Real Burning Fire Canvas Simulation */}
      <div className="flame-banner__fire-layer" aria-hidden="true">
        <FireCanvas height={110} intensity={intensity} showEmbers={true} />
      </div>

      <div className="flame-banner__inner">
        <div className="flame-banner__content">
          <div className="flame-banner__badge">
            <span className="flame-banner__badge-glow" />
            <span className="flame-banner__badge-text">وضع الحماس مشتعل</span>
            <span className="flame-banner__badge-count">
              {toArabicDigits(count)} رسالة
            </span>
          </div>

          <h3 className="flame-banner__title">{levelText}</h3>
          {!collapsed && <p className="flame-banner__desc">{descText}</p>}
        </div>

        <div className="flame-banner__actions">
          <button
            type="button"
            className="flame-banner__toggle-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'توسيع الشعلة' : 'طي التفاصيل'}
          >
            {collapsed ? 'عرض التفاصيل' : 'طي'}
          </button>
        </div>
      </div>
    </div>
  );
}
