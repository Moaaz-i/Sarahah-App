import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
      <section className="hero">
        <p className="hero__eyebrow">صارحني</p>
        <h1 className="hero__title">
          قُلها بصدق،
          <br />
          <span className="hero__accent">من دون أن يعرفوا من أنت.</span>
        </h1>
        <p className="hero__sub">
          أنشئ صفحتك، شارك الرابط، واستقبل رسائل صريحة من الناس — والخادم لا
          يحفظ اسم المرسل ولا عنوانه ولا أي أثر يعود إليك.
        </p>

        <form className="lookup" onSubmit={go}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="اسم المستخدم (مثال: sara)"
            aria-label="اسم المستخدم"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!username.trim()}
          >
            افتح صفحته
          </button>
        </form>

        <div className="hero__cta">
          {user ? (
            <Link className="btn btn--big btn--outline" to="/inbox">
              افتح صندوق واردك
            </Link>
          ) : (
            <>
              <Link className="btn btn--big btn--outline" to="/register">
                أنشئ صفحتك مجانًا
              </Link>
              <Link className="btn btn--big btn--ghost" to="/login">
                لدي حساب
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="features">
        <article className="feature">
          <div className="feature__icon" aria-hidden="true">
            🎭
          </div>
          <h3>مرسل مجهول دائمًا</h3>
          <p>
            نموذج الرسالة لا يحوي حقل مرسل أصلًا. لا الاسم، ولا البريد، ولا وكيل
            المستخدم — لا يوجد ما يُحذف لأنه لم يُخزَّن من الأساس.
          </p>
        </article>

        <article className="feature">
          <div className="feature__icon" aria-hidden="true">
            🔒
          </div>
          <h3>جلسات مُدارة بصرامة</h3>
          <p>
            رمز وصول ينتهي بعد 15 دقيقة، ورمز تحديث يُدوَّر في كل استخدام. إعادة
            استخدام رمز قديم تُبطل السلسلة كاملة وتسجَّل في سجل التدقيق.
          </p>
        </article>

        <article className="feature">
          <div className="feature__icon" aria-hidden="true">
            🛡️
          </div>
          <h3>إبلاغ وفلترة</h3>
          <p>
            حدّ يومي لكل مرسل مجهول، بصمة مُملَّحة لا يمكن عكسها، ومراجعة إدارية
            موثّقة لكل بلاغ.
          </p>
        </article>
      </section>

      <section className="steps">
        <h2>كيف يعمل؟</h2>
        <ol>
          <li>
            <strong>أنشئ حسبك</strong> — اسم مستخدم وبريد وكلمة مرور، أو تابع
            بحساب Google.
          </li>
          <li>
            <strong>شارك رابط صفحتك</strong> — يصبح <code>/u/username</code>{" "}
            وجهتك العامة.
          </li>
          <li>
            <strong>اقرأ واردك</strong> — وسّط القراءة والأرشفة، وأبلغ عن أي
            محتوى غير لائق.
          </li>
        </ol>
      </section>
    </div>
  );
}
