import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page page--narrow center">
      <div className="nf">
        <span className="nf__code">404</span>
        <h1>لا يوجد شيء هنا</h1>
        <p className="muted">الرابط الذي طلبته غير موجود أو نُقل.</p>
        <Link className="btn btn--primary" to="/">
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
