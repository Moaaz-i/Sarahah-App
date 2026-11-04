import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { identityRequestsApi, resolveUploadUrl } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Avatar from '../components/Avatar.jsx';
import { getSocket } from '../lib/socket.js';

export default function IdentityRequests() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('received'); // 'received' | 'sent'
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [respondingId, setRespondingId] = useState(null);

  const fetchRequests = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [receivedRes, sentRes] = await Promise.all([
        identityRequestsApi.getReceived({ limit: 50 }),
        identityRequestsApi.getSent({ limit: 50 }),
      ]);
      setReceivedRequests(receivedRes.data?.requests || []);
      setSentRequests(sentRes.data?.requests || []);
    } catch (err) {
      if (!isSilent) toast.error(err.message || 'فشل تحميل طلبات الهوية');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time listener for updates (silent background refresh)
  useEffect(() => {
    const socket = getSocket();
    const handleEvent = () => {
      fetchRequests(true);
    };

    socket.on('identity_request', handleEvent);
    socket.on('conversation_created', handleEvent);

    return () => {
      socket.off('identity_request', handleEvent);
      socket.off('conversation_created', handleEvent);
    };
  }, [fetchRequests]);

  const requests = activeTab === 'received' ? receivedRequests : sentRequests;

  const handleRespond = async (requestId, action) => {
    setRespondingId(requestId);
    try {
      await identityRequestsApi.respond(requestId, action);
      toast.success(
        action === 'accept'
          ? 'تم قبول الطلب وكشف هويتك وبدء المحادثة بنجاح! 🎉'
          : 'تم رفض الطلب، هويتك ستظل مجهولة ومحمية تماماً 🔒',
      );
      fetchRequests();
    } catch (err) {
      toast.error(err.message || 'تعذر معالجة الطلب');
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <div className="inbox-page" style={{ maxWidth: '880px', margin: '0 auto' }}>
      <header className="page-head">
        <h1 className="page-head__title">🎭 طلبات كشف الهوية</h1>
        <p className="page-head__subtitle">
          تحكم في سرية هويتك: اقبل أو ارفض رغبة الآخرين في معرفة من أرسل الصراحة
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
        <div className="inbox-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'received'}
            className={`inbox-tab ${activeTab === 'received' ? 'inbox-tab--active' : ''}`}
            onClick={() => setActiveTab('received')}
          >
            📥 طلبات مستلمة
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sent'}
            className={`inbox-tab ${activeTab === 'sent' ? 'inbox-tab--active' : ''}`}
            onClick={() => setActiveTab('sent')}
          >
            📤 طلباتي المرسلة
          </button>
        </div>
      </div>

      {initialLoading ? (
        <div className="center-pad" style={{ padding: '3.5rem 0' }}>
          <Spinner label="جارٍ تحميل طلبات الهوية…" />
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="🎭"
          title={
            activeTab === 'received'
              ? 'لا توجد طلبات هوية مستلمة حالياً'
              : 'لم تقم بإرسال أي طلب كشف هوية بعد'
          }
          subtitle={
            activeTab === 'received'
              ? 'عندما يطلب مستلم إحدى رسائلك معرفة هويتك، ستظهر لك هنا لتختار قبولها أو رفضها بحرية تامة.'
              : 'يمكنك طلب كشف هوية مرسل أي رسالة صريحة مسجلة تلقيتها من صندوق الوارد الخاص بك.'
          }
        />
      ) : (
        <div className="msg-list">
          {requests.map((req) => {
            const isPending = req.status === 'pending';
            const isAccepted = req.status === 'accepted';
            const isRejected = req.status === 'rejected';

            const cardClass = isPending
              ? 'id-req-card id-req-card--pending'
              : isAccepted
              ? 'id-req-card id-req-card--accepted'
              : 'id-req-card id-req-card--rejected';

            return (
              <article key={req._id} className={cardClass}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  {activeTab === 'received' ? (
                    <div className="id-req-user-block">
                      <Avatar
                        src={resolveUploadUrl(req.receiver?.avatar)}
                        name={req.receiver?.name || 'مستخدم'}
                        username={req.receiver?.username}
                        size={42}
                      />
                      <div className="id-req-user-info">
                        <span className="id-req-user-name">{req.receiver?.name}</span>
                        <span className="id-req-user-handle">@{req.receiver?.username}</span>
                        <span className="id-req-user-action">طلب معرفة هويتك عن الرسالة التالية:</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {isAccepted && req.sender ? (
                        <div className="id-req-user-block">
                          <Avatar
                            src={resolveUploadUrl(req.sender?.avatar)}
                            name={req.sender?.name || 'مستخدم'}
                            username={req.sender?.username}
                            size={42}
                          />
                          <div className="id-req-user-info">
                            <span className="id-req-user-name" style={{ color: 'var(--ok)' }}>
                              🔓 كشف هويته: {req.sender?.name}
                            </span>
                            <span className="id-req-user-handle">@{req.sender?.username}</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-2)' }}>
                          <span style={{ fontSize: '1.25rem' }}>🎭</span>
                          <span>طلب كشف هوية المرسل الحقيقي</span>
                        </div>
                      )}
                    </div>
                  )}

                  <time className="msg__time" dateTime={req.createdAt}>
                    {relativeTime(req.createdAt)}
                  </time>
                </div>

                {/* Original message quote */}
                <div className="id-req-message-box">
                  <div className="id-req-message-label">
                    <span>💬</span> نص الرسالة الصريحة الأصلية
                  </div>
                  <p className="id-req-message-content">
                    {req.message?.content || '(محتوى الرسالة)'}
                  </p>
                </div>

                {/* Status & Actions Footer */}
                <div className="id-req-footer">
                  <div>
                    {isPending && (
                      <span className="id-req-status-pill id-req-status-pill--pending">
                        ⏳ قيد الانتظار
                      </span>
                    )}
                    {isRejected && (
                      <span className="id-req-status-pill id-req-status-pill--rejected">
                        🔒 رُفض الطلب (الهوية لا تزال محمية)
                      </span>
                    )}
                    {isAccepted && (
                      <span className="id-req-status-pill id-req-status-pill--accepted">
                        ✓ تم قبول الطلب وكشف الهوية
                      </span>
                    )}
                  </div>

                  <div className="id-req-actions">
                    {activeTab === 'received' && isPending && (
                      <>
                        <button
                          type="button"
                          className="btn btn--sm btn--accept-identity"
                          disabled={respondingId === req._id}
                          onClick={() => handleRespond(req._id, 'accept')}
                        >
                          ✓ قبول وكشف هويتي
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--reject-identity"
                          disabled={respondingId === req._id}
                          onClick={() => handleRespond(req._id, 'reject')}
                        >
                          ✕ رفض وحفظ السرية
                        </button>
                      </>
                    )}

                    {req.conversation && (
                      <Link
                        to={`/conversations/${req.conversation._id || req.conversation}`}
                        className="btn btn--sm btn--chat-link"
                      >
                        💬 فتح المحادثة الخاصة
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
