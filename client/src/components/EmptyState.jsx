export default function EmptyState({ icon = '📭', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="empty__title">{title}</h3>
      {children && <div className="empty__body">{children}</div>}
      {action}
    </div>
  );
}
