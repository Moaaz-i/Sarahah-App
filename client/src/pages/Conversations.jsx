import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { conversationsApi, resolveUploadUrl } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Avatar from '../components/Avatar.jsx';
import EmojiPicker, { QuickEmojiBar } from '../components/EmojiPicker.jsx';
import { getSocket } from '../lib/socket.js';

export default function Conversations() {
  const { id: activeId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState([]);

  // Active chat state
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const feedRef = useRef(null);

  // Scroll inner messages feed to bottom without touching page window scroll
  const scrollFeedToBottom = () => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  };

  // Fetch conversations list
  const fetchConversations = useCallback(async () => {
    try {
      const res = await conversationsApi.list({ limit: 50 });
      setConversations(res.data?.conversations || []);
    } catch (err) {
      toast.error(err.message || 'تعذر تحميل قائمة المحادثات');
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch active conversation and its messages
  useEffect(() => {
    if (!activeId) {
      setActiveConv(null);
      setMessages([]);
      return;
    }

    // Instant render: pre-populate header from list if available
    const existing = conversations.find((c) => String(c._id) === String(activeId));
    if (existing) {
      setActiveConv(existing);
    }

    let active = true;
    // Only show loader if we have zero data for this conversation
    setLoadingMessages(!existing);

    Promise.all([
      conversationsApi.get(activeId),
      conversationsApi.getMessages(activeId, { limit: 100 }),
    ])
      .then(([convRes, msgsRes]) => {
        if (!active) return;
        setActiveConv(convRes.data);
        setMessages(msgsRes.data?.messages || []);
        setTimeout(scrollFeedToBottom, 30);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err.message || 'تعذر تحميل المحادثة');
        navigate('/conversations');
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });

    return () => {
      active = false;
    };
  }, [activeId, conversations, navigate, toast]);

  // Socket room connection for real-time messages
  useEffect(() => {
    if (!activeId) return;

    const socket = getSocket();
    socket.emit('join_conversation', activeId);

    const handleNewMessage = (msg) => {
      if (String(msg.conversation) === String(activeId)) {
        setMessages((prev) => {
          if (prev.some((m) => String(m._id) === String(msg._id))) return prev;
          return [...prev, msg];
        });
      }
    };

    socket.on('conversation_message', handleNewMessage);

    return () => {
      socket.emit('leave_conversation', activeId);
      socket.off('conversation_message', handleNewMessage);
    };
  }, [activeId]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const content = inputText.trim();
    if (!content || !activeId || sending) return;

    setSending(true);
    try {
      const res = await conversationsApi.sendMessage(activeId, content);
      const sentMsg = res.data;
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(sentMsg._id))) return prev;
        return [...prev, sentMsg];
      });
      setInputText('');
      fetchConversations(); // refresh snippet in sidebar
      setTimeout(scrollFeedToBottom, 30);
    } catch (err) {
      toast.error(err.message || 'تعذر إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const getOtherParticipant = (conv) => {
    if (!conv?.participants || !user) return null;
    return conv.participants.find((p) => String(p._id || p) !== String(user._id));
  };

  const otherUser = getOtherParticipant(activeConv);

  return (
    <div className="conv-container">
      <header className="page-head" style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-head__title">💬 المحادثات المباشرة</h1>
        <p className="page-head__subtitle">
          محادثاتك الخاصة والمفتوحة بعد قبول كشف الهوية للرسائل الصريحة
        </p>
      </header>

      <div
        className={`conv-layout ${
          activeId ? 'conv-layout--viewing-chat' : 'conv-layout--listing'
        }`}
      >
        {/* Left Side: Conversations List */}
        <div className="conv-sidebar">
          <div className="conv-sidebar-header">
            <span className="conv-sidebar-title">
              <span>💬</span> كل المحادثات
            </span>
            <span className="conv-sidebar-badge">
              {conversations.length}
            </span>
          </div>

          {loadingList ? (
            <div className="center-pad" style={{ padding: '3rem 0' }}>
              <Spinner label="تحميل…" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon="💬"
              title="لا توجد محادثات نشطة"
              subtitle="تبدأ المحادثات المباشرة تلقائياً عندما يقبل أحد المستخدمين طلب كشف الهوية لرسالة صريحة."
            />
          ) : (
            <div className="conv-list">
              {conversations.map((c) => {
                const partner = getOtherParticipant(c);
                const isSelected = activeId === c._id;
                return (
                  <Link
                    key={c._id}
                    to={`/conversations/${c._id}`}
                    className={`conv-item ${isSelected ? 'conv-item--active' : ''}`}
                  >
                    <div className="conv-item-avatar-wrap">
                      <Avatar
                        src={resolveUploadUrl(partner?.avatar)}
                        name={partner?.name || 'مستخدم'}
                        username={partner?.username}
                        size={44}
                      />
                      <span className="conv-item-online-ring" />
                    </div>
                    <div className="conv-item-meta">
                      <div className="conv-item-top">
                        <span className="conv-item-name">{partner?.name || 'مستخدم'}</span>
                        <time className="conv-item-time">{relativeTime(c.updatedAt)}</time>
                      </div>
                      <div className="conv-item-snippet">
                        {c.lastMessage?.content || 'انقر لفتح المحادثة'}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Active Chat View */}
        {activeId ? (
          <div className="conv-main">
            {/* Chat Top Header */}
            <div className="conv-header">
              <div className="conv-header-user">
                <Link
                  to="/conversations"
                  className="btn btn--ghost btn--sm"
                  style={{ padding: '0.4rem 0.65rem' }}
                  title="الرجوع للقائمة"
                >
                  ←
                </Link>
                {otherUser && (
                  <>
                    <Avatar
                      src={resolveUploadUrl(otherUser?.avatar)}
                      name={otherUser?.name || 'مستخدم'}
                      username={otherUser?.username}
                      size={42}
                    />
                    <div className="conv-header-details">
                      <span className="conv-header-title">{otherUser?.name}</span>
                      <span className="conv-header-sub">
                        <span className="dot" />
                        <span>@{otherUser?.username} — هوية مكشوفة</span>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {otherUser?.username && (
                <Link
                  to={`/u/${otherUser.username}`}
                  className="btn btn--ghost btn--sm"
                  style={{ color: 'var(--brand-2)' }}
                  target="_blank"
                  rel="noreferrer"
                >
                  👤 الملف الشخصي
                </Link>
              )}
            </div>

            {/* Original Anonymous Message Context Banner */}
            {activeConv?.message && (
              <div className="conv-context-banner">
                <div className="conv-context-text">
                  <strong>💬 أصل الصراحة:</strong> "{activeConv.message.content}"
                </div>
              </div>
            )}

            {/* Messages Stream */}
            <div className="conv-feed" ref={feedRef}>
              {loadingMessages ? (
                <div className="center-pad" style={{ margin: 'auto' }}>
                  <Spinner label="جارٍ تحميل الرسائل…" />
                </div>
              ) : messages.length === 0 ? (
                <div className="conv-empty-state">
                  <span className="conv-empty-icon">💬</span>
                  <strong style={{ color: 'var(--text)', marginBottom: '0.35rem' }}>
                    ابدأ المحادثة الآن
                  </strong>
                  <span style={{ fontSize: '0.9rem' }}>
                    اكتب أول رسالة للطرف الآخر للتواصل بخصوص الصراحة المكشوفة
                  </span>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = String(m.sender?._id || m.sender) === String(user?._id);
                  return (
                    <div
                      key={m._id}
                      className={`chat-bubble-row ${
                        isMine ? 'chat-bubble-row--me' : 'chat-bubble-row--them'
                      }`}
                    >
                      <div
                        className={`chat-bubble ${
                          isMine ? 'chat-bubble--me' : 'chat-bubble--them'
                        }`}
                      >
                        {m.content}
                      </div>
                      <time className="chat-bubble-meta">
                        {relativeTime(m.createdAt)}
                      </time>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Input Bar with Emoji Support */}
            <div className="conv-composer-container">
              <QuickEmojiBar
                disabled={sending}
                onSelect={(emoji) => setInputText((prev) => prev + emoji)}
              />
              <form onSubmit={handleSendMessage} className="conv-input-area">
                <div className="conv-input-wrapper">
                  <EmojiPicker
                    disabled={sending}
                    onSelect={(emoji) => setInputText((prev) => prev + emoji)}
                  />
                  <input
                    type="text"
                    className="conv-text-input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="اكتب رسالتك هنا… (اضغط Enter للإرسال)"
                    disabled={sending}
                    maxLength={2000}
                  />
                </div>
                <button
                  type="submit"
                  className="conv-send-btn"
                  disabled={sending || !inputText.trim()}
                >
                  {sending ? 'جارٍ الإرسال…' : 'إرسال 🚀'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="conv-main">
            <div className="conv-empty-state">
              <span className="conv-empty-icon">💬</span>
              <h3 style={{ color: 'var(--text)' }}>اختر محادثة للبدء</h3>
              <p style={{ maxWidth: '360px', fontSize: '0.9rem' }}>
                انقر على أي محادثة من القائمة الجانبية لقراءة الرسائل والمشاركة في الدردشة المباشرة.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
