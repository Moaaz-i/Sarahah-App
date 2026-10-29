import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from "../components/Logo.jsx";
import { useAuth } from '../lib/auth.jsx';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');

  const go = (e) => {
    e.preventDefault();
    const value = username.trim().replace(/^@/, '');
    if (value) navigate(`/u/${encodeURIComponent(value)}`);
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__badge">
          <span className="hero__badge-pulse" />
          <span>منصة المصارحة المشفرة الأكثر أمانًا وخصوصية</span>
        </div>

        <div className="hero__logo-wrap">
          <Logo size={76} showText={false} />
        </div>

        <h1 className="hero__title">
          قُلها بصدق تام،
          <br />
          <span className="hero__accent">من دون أن يعرفوا أبدًا مَن أنت.</span>
        </h1>

        <p className="hero__sub">
          شارك رابط صفحتك الخاصة مع متابعيك وأصدقائك، واستقبل آراء صادقة، نقدًا
          بنّاءً، واعترافات لطيفة بسرية تامة ودون حفظ أي بيانات عن هوية المرسل.
        </p>

        {/* Quick Search / Direct Link Input */}
        <form className="lookup" onSubmit={go}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="اكتب اسم المستخدم (مثال: sara)"
            aria-label="اسم المستخدم"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!username.trim()}
          >
            افتح الصفحة 🚀
          </button>
        </form>

        <div className="hero__cta">
          {user ? (
            <div className="hero__cta-group">
              <Link className="btn btn--big btn--primary" to="/inbox">
                📥 صندوق الوارد الخاص بك
              </Link>
              <Link
                className="btn btn--big btn--outline"
                to={`/u/${user.username}`}
              >
                👤 صفحتك العامة
              </Link>
            </div>
          ) : (
            <div className="hero__cta-group">
              <Link className="btn btn--big btn--primary" to="/register">
                ✨ أنشئ حسابك الآن مجانًا
              </Link>
              <Link className="btn btn--big btn--outline" to="/login">
                تسجيل الدخول
              </Link>
            </div>
          )}
        </div>

        {/* Interactive Demo Preview Card */}
        <div className="hero__preview">
          <div className="hero__preview-card">
            <div className="hero__preview-header">
              <div className="hero__preview-dots">
                <span className="dot dot--red" />
                <span className="dot dot--yellow" />
                <span className="dot dot--green" />
              </div>
              <span className="hero__preview-label">
                مثال على رسالة صريحة ✉️
              </span>
            </div>
            <p className="hero__preview-text">
              ”أحببت طريقة تعاملك وإيجابيتك الدائمة في الفريق، حضورك يُحدث فرقًا
              حقيقيًا كل يوم! استمر في تألقك ✨“
            </p>
            <div className="hero__preview-footer">
              <span className="hero__preview-tag">رسالة مجهولة مشفرة</span>
              <span className="hero__preview-time">منذ بضع دقائق</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="features">
        <article className="feature-card">
          <div className="feature-card__icon">🎭</div>
          <h3>هوية مجهولة بنسبة 100%</h3>
          <p>
            لا نخزن أسماء، ولا عناوين IP، ولا بصمات أجهزة للمرسل. السرية التامة
            مضمونة هندسيًا وبرمجيًا من الأساس.
          </p>
        </article>

        <article className="feature-card">
          <div className="feature-card__icon">⚡</div>
          <h3>أمان متطور وحماية Redis</h3>
          <p>
            جلسات عمل لحظية مع إمكانية تسجيل الخروج من كل الأجهزة بضغطة زر واحدة
            وإلغاء فوري للرموز عبر كاش سحابي فائق السرعة.
          </p>
        </article>

        <article className="feature-card">
          <div className="feature-card__icon">🛡️</div>
          <h3>فلترة ذكية وفحص الملفات</h3>
          <p>
            حماية متقدمة ضد الملفات الضارة عبر فحص الأرقام السحرية (Magic Bytes)
            وكشف التلاعب، بالإضافة لدرع الذكاء الاصطناعي لحجب الإساءات.
          </p>
        </article>

        <article className="feature-card">
          <div className="feature-card__icon">📸</div>
          <h3>مشاركة ستوري ورمز QR</h3>
          <p>
            صدّر رسائلك فورًا كبطاقات ستوري احترافية بتصاميم متعددة لمشاركتها
            على إنستجرام وسناب شات مع رمز QR خاص برابطك.
          </p>
        </article>
      </section>

      {/* 3 Simple Steps */}
      <section className="steps-section">
        <h2 className="steps-section__title">ابدأ في ثلاث خطوات سهلة</h2>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-card__number">1</div>
            <h4>أنشئ حسابك مجانًا</h4>
            <p>اختر اسم مستخدم فريدًا في ثوانٍ معدودة وبدون أي تعقيد.</p>
          </div>
          <div className="step-card">
            <div className="step-card__number">2</div>
            <h4>انشر رابطك أو رمز الـ QR</h4>
            <p>شاركه في قصتك على إنستجرام، سناب شات، أو في البايو الخاص بك.</p>
          </div>
          <div className="step-card">
            <div className="step-card__number">3</div>
            <h4>استقبل المصارحات الصادقة</h4>
            <p>
              اقرأ الرسائل، شارك بطاقات الردود، وحوّل الملاحظات القيمة إلى أهداف
              شخصية.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
