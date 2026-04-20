import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  UserCircle,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type AuthMethod = 'phone' | 'email';
type AuthScreenMode = 'signIn' | 'signUp';
type AuthCredentialMode = 'password' | 'code';
type TabKey = 'contacts' | 'chats' | 'profile';
type ConnectionStatus = 'offline' | 'connecting' | 'reconnecting' | 'online';
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
type MessageKind = 'text' | 'image';

type Session = {
  token: string;
  userID: string;
  displayName: string;
};

type ContactDTO = {
  userID: string;
  displayName: string;
  contact: string;
  isCurrentUser: boolean;
};

type ChatListItem = {
  id: string;
  title: string;
  lastMessagePreview?: string | null;
  updatedAt: string;
  unreadCount: number;
  typingParticipants: string[];
  participantNames: string[];
  participantCount: number;
};

type MessageAttachment = {
  id: string;
  kind: 'image';
  url?: string | null;
  thumbnailURL?: string | null;
};

type MessageRecord = {
  id: string;
  messageID?: string;
  chatID: string;
  localID?: string;
  authorID: string;
  authorName: string;
  kind: MessageKind;
  text: string;
  mediaID?: string | null;
  mediaURL?: string | null;
  status: MessageStatus;
  createdAt: string;
  attachments?: MessageAttachment[];
};

type AuthResponse = {
  token: string;
  userID: string;
  displayName: string;
};

type AuthCodeResponse = {
  expiresIn?: number | null;
};

const DEMO_ACCOUNTS = [
  { displayName: 'Анна Demo', contact: '+15551230011', password: 'demo1111' },
  { displayName: 'Борис Demo', contact: '+15551230012', password: 'demo2222' },
  { displayName: 'Вера Demo', contact: '+15551230013', password: 'demo3333' },
  { displayName: 'Глеб Demo', contact: '+15551230014', password: 'demo4444' },
  { displayName: 'Даша Demo', contact: '+15551230015', password: 'demo5555' },
] as const;

const STORAGE = {
  session: 'mobile-messenger-web.session',
  baseUrl: 'mobile-messenger-web.base-url',
};

const DEFAULT_BASE_URL = "https://mobile-messenger-ios-production.up.railway.app/api";
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function getInitials(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function relativeDate(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];

  for (const [unit, divisor] of units) {
    if (abs >= divisor || unit === 'minute') {
      return formatter.format(Math.round(diff / divisor), unit);
    }
  }

  return 'только что';
}

function sanitizeContact(contact: string, method: AuthMethod) {
  const trimmed = contact.trim();
  return method === 'phone' ? trimmed.replace(/[^+\d]/g, '') : trimmed.toLowerCase();
}

async function api<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
  });

  const raw = await response.text();
  const data = raw ? tryParse(raw) : null;

  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as Record<string, unknown>).message)
      : raw || `Ошибка сервера ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function tryParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState<string>(() => localStorage.getItem(STORAGE.baseUrl) || DEFAULT_BASE_URL);
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem(STORAGE.session);
    return raw ? (tryParse(raw) as Session) : null;
  });
  const [tab, setTab] = useState<TabKey>('chats');
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(navigator.onLine ? 'connecting' : 'offline');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE.baseUrl, baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE.session, JSON.stringify(session));
    else localStorage.removeItem(STORAGE.session);
  }, [session]);

  useEffect(() => {
    const handleOnline = () => setConnectionStatus(session ? 'reconnecting' : 'offline');
    const handleOffline = () => setConnectionStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setConnectionStatus('offline');
      return;
    }

    let cancelled = false;
    setConnectionStatus(navigator.onLine ? 'connecting' : 'offline');

    api<unknown>(baseUrl, '/health', { method: 'GET' }, session.token)
      .then(() => {
        if (!cancelled) setConnectionStatus('online');
      })
      .catch(() => {
        if (!cancelled) setConnectionStatus(navigator.onLine ? 'reconnecting' : 'offline');
      });

    return () => {
      cancelled = true;
    };
  }, [baseUrl, session, revision]);

  if (!session) {
    return (
      <AuthScreen
        baseUrl={baseUrl}
        setBaseUrl={setBaseUrl}
        onAuthenticated={(value) => {
          setSession(value);
          setRevision((prev) => prev + 1);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="app-grid">
        <Sidebar
          session={session}
          tab={tab}
          setTab={setTab}
          baseUrl={baseUrl}
          setBaseUrl={setBaseUrl}
          connectionStatus={connectionStatus}
          onLogout={() => {
            setSession(null);
            setSelectedChat(null);
          }}
        />

        <div className="column-card">
          {tab === 'contacts' ? (
            <ContactsPanel
              baseUrl={baseUrl}
              token={session.token}
              onOpenChat={(chat) => {
                setSelectedChat(chat);
                setTab('chats');
                setRevision((prev) => prev + 1);
              }}
            />
          ) : tab === 'profile' ? (
            <ProfilePanel session={session} connectionStatus={connectionStatus} />
          ) : (
            <ChatsPanel
              key={`chats-${revision}`}
              baseUrl={baseUrl}
              token={session.token}
              selectedChatID={selectedChat?.id ?? null}
              onSelectChat={setSelectedChat}
              onChatCreated={setSelectedChat}
            />
          )}
        </div>

        <div className="column-card dialog-column">
          <DialogPanel
            key={selectedChat?.id ?? 'empty'}
            baseUrl={baseUrl}
            token={session.token}
            currentUserID={session.userID}
            chat={selectedChat}
          />
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  session,
  tab,
  setTab,
  baseUrl,
  setBaseUrl,
  connectionStatus,
  onLogout,
}: {
  session: Session;
  tab: TabKey;
  setTab: (value: TabKey) => void;
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar-card">
      <div>
        <div className="eyebrow">Mobile Messenger</div>
        <h1 className="title-lg">Web Client</h1>
        <p className="muted mt-8">Готовая веб-версия для работы с тем же backend, что и у iOS-клиента.</p>
      </div>

      <div className="session-card mt-20">
        <div className="text-sm text-slate-300">Текущий пользователь</div>
        <div className="session-name">{session.displayName}</div>
        <div className="session-id">{session.userID}</div>
      </div>

      <ConnectionBadge status={connectionStatus} />

      <nav className="nav-list mt-20">
        {[
          { key: 'contacts' as const, label: 'Контакты', icon: <Users className="icon-18" /> },
          { key: 'chats' as const, label: 'Чаты', icon: <MessageCircle className="icon-18" /> },
          { key: 'profile' as const, label: 'Профиль', icon: <UserCircle className="icon-18" /> },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn('nav-button', tab === item.key && 'nav-button-active')}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="input-group mt-20">
        <label className="label">REST base URL</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input" />
        <div className="hint">По умолчанию используется адрес backend: {DEFAULT_BASE_URL}</div>
      </div>

      <button className="danger-button mt-20" onClick={onLogout}>
        <LogOut className="icon-18" />
        Выйти
      </button>
    </aside>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { text: string; className: string; icon: JSX.Element }> = {
    online: { text: 'Онлайн', className: 'state-green', icon: <Wifi className="icon-16" /> },
    connecting: { text: 'Подключение', className: 'state-blue', icon: <RefreshCw className="icon-16 spin" /> },
    reconnecting: { text: 'Повторное подключение', className: 'state-amber', icon: <RefreshCw className="icon-16" /> },
    offline: { text: 'Офлайн', className: 'state-red', icon: <WifiOff className="icon-16" /> },
  };

  const item = map[status];
  return <div className={cn('connection-badge', item.className)}>{item.icon}<span>{item.text}</span></div>;
}

function AuthScreen({
  baseUrl,
  setBaseUrl,
  onAuthenticated,
}: {
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  onAuthenticated: (value: Session) => void;
}) {
  const [screenMode, setScreenMode] = useState<AuthScreenMode>('signIn');
  const [credentialMode, setCredentialMode] = useState<AuthCredentialMode>('password');
  const [method, setMethod] = useState<AuthMethod>('phone');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<'none' | 'request' | 'verify' | 'login'>('none');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const isPasswordFlow = screenMode === 'signIn' && credentialMode === 'password';
  const isContactValid = method === 'phone'
    ? contact.replace(/\D/g, '').length >= 10
    : contact.includes('@') && contact.includes('.');

  async function requestCode() {
    setError(null);
    setIsLoading('request');
    try {
      const response = await api<AuthCodeResponse>(baseUrl, '/auth/request', {
        method: 'POST',
        body: JSON.stringify({ method, contact: sanitizeContact(contact, method) }),
      });
      setIsCodeSent(true);
      setExpiresIn(response?.expiresIn ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запросить код');
    } finally {
      setIsLoading('none');
    }
  }

  async function verifyCode() {
    setError(null);
    setIsLoading('verify');
    try {
      const response = await api<AuthResponse>(baseUrl, '/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ method, contact: sanitizeContact(contact, method), code: code.trim() }),
      });
      onAuthenticated(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подтвердить код');
    } finally {
      setIsLoading('none');
    }
  }

  async function signIn() {
    setError(null);
    setIsLoading('login');
    try {
      const response = await api<AuthResponse>(baseUrl, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ method, contact: sanitizeContact(contact, method), password: password.trim() }),
      });
      onAuthenticated(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить вход');
    } finally {
      setIsLoading('none');
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="eyebrow-light">iOS → Web</div>
        <h2 className="hero-title">Готовый интерфейс для тех же сценариев, что и в мобильном клиенте.</h2>
        <p className="hero-text">Реализованы авторизация, загрузка контактов, создание диалогов, список чатов и история сообщений через существующий backend.</p>

        <div className="hero-grid">
          <HeroCard icon={<Lock className="icon-20" />} title="Auth" text="Телефон или e-mail, пароль или код подтверждения." />
          <HeroCard icon={<Users className="icon-20" />} title="Contacts" text="Загрузка контактов и старт личного диалога." />
          <HeroCard icon={<MessageCircle className="icon-20" />} title="Chats" text="Чаты, unread count, typing state и история сообщений." />
          <HeroCard icon={<ImageIcon className="icon-20" />} title="Media" text="Структура готова к отображению изображений из backend." />
        </div>
      </section>

      <section className="auth-form-wrap">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="auth-card">
          <div className="eyebrow">Mobile Messenger Web</div>
          <h1 className="title-lg">Авторизация</h1>

          <div className="input-group mt-20">
            <label className="label">REST base URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input" />
          </div>

          <div className="tabs mt-20">
            <button className={cn('tab', screenMode === 'signIn' && 'tab-active')} onClick={() => {
              setScreenMode('signIn');
              setCredentialMode('password');
              setError(null);
              setCode('');
              setIsCodeSent(false);
            }}>Sign In</button>
            <button className={cn('tab', screenMode === 'signUp' && 'tab-active')} onClick={() => {
              setScreenMode('signUp');
              setCredentialMode('code');
              setError(null);
              setCode('');
              setIsCodeSent(false);
            }}>Sign Up</button>
          </div>

          {screenMode === 'signIn' && (
            <div className="tabs mt-12">
              <button className={cn('tab secondary', credentialMode === 'password' && 'tab-active-dark')} onClick={() => {
                setCredentialMode('password');
                setError(null);
                setCode('');
              }}>Password</button>
              <button className={cn('tab secondary', credentialMode === 'code' && 'tab-active-dark')} onClick={() => {
                setCredentialMode('code');
                setError(null);
                setCode('');
              }}>Code</button>
            </div>
          )}

          <div className="tabs mt-12">
            <button className={cn('tab secondary', method === 'phone' && 'tab-soft-active')} onClick={() => setMethod('phone')}>
              <Smartphone className="icon-16" /> Телефон
            </button>
            <button className={cn('tab secondary', method === 'email' && 'tab-soft-active')} onClick={() => setMethod('email')}>
              <Mail className="icon-16" /> E-mail
            </button>
          </div>

          <div className="input-group mt-20">
            <label className="label">{method === 'phone' ? 'Номер телефона' : 'E-mail'}</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="input"
              placeholder={method === 'phone' ? '+375 ...' : 'name@example.com'}
            />
          </div>

          {isPasswordFlow ? (
            <div className="input-group mt-12">
              <label className="label">Пароль</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" type="password" placeholder="Введите пароль" />
            </div>
          ) : (
            <>
              <button className="soft-button mt-20" onClick={requestCode} disabled={!isContactValid || isLoading !== 'none'}>
                <KeyRound className="icon-16" />
                {isLoading === 'request' ? 'Отправка...' : isCodeSent ? 'Отправить код снова' : 'Запросить код'}
              </button>

              <div className="input-group mt-12">
                <label className="label">Код подтверждения</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} className="input" placeholder="Введите код" />
              </div>

              {typeof expiresIn === 'number' && (
                <div className="success-box mt-12">Код отправлен. Время действия: {expiresIn} секунд.</div>
              )}
            </>
          )}

          {error && <div className="error-box mt-12"><AlertTriangle className="icon-16" /> <span>{error}</span></div>}

          <button
            className="primary-button mt-20"
            onClick={() => (isPasswordFlow ? signIn() : verifyCode())}
            disabled={!isContactValid || isLoading !== 'none' || (isPasswordFlow ? password.trim().length < 4 : code.trim().length < 4)}
          >
            {isLoading === 'login' ? 'Вход...' : isLoading === 'verify' ? 'Проверка...' : isPasswordFlow ? 'Войти' : 'Подтвердить'}
          </button>

          <div className="demo-list mt-20">
            <div className="label">Demo Accounts</div>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.contact}
                className="demo-card"
                onClick={() => {
                  setScreenMode('signIn');
                  setCredentialMode('password');
                  setMethod('phone');
                  setContact(account.contact);
                  setPassword(account.password);
                  setError(null);
                }}
              >
                <div className="font-semibold">{account.displayName}</div>
                <div className="muted text-sm mt-4">{account.contact}</div>
                <div className="hint mt-8">Пароль: {account.password}</div>
              </button>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function HeroCard({ icon, title, text }: { icon: JSX.Element; title: string; text: string }) {
  return (
    <div className="hero-card">
      <div className="hero-icon">{icon}</div>
      <div className="font-semibold mt-12">{title}</div>
      <div className="hero-card-text mt-8">{text}</div>
    </div>
  );
}

function ContactsPanel({
  baseUrl,
  token,
  onOpenChat,
}: {
  baseUrl: string;
  token: string;
  onOpenChat: (chat: ChatListItem) => void;
}) {
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<ContactDTO[]>(baseUrl, '/auth/contacts', { method: 'GET' }, token)
      .then((data) => {
        if (!cancelled) {
          setContacts(data);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Не удалось загрузить контакты'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [baseUrl, token]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      contact.displayName.toLowerCase().includes(query) || contact.contact.toLowerCase().includes(query)
    );
  }, [contacts, search]);

  async function openChat(contact: ContactDTO) {
    if (contact.isCurrentUser) return;
    setOpeningId(contact.userID);
    try {
      const chat = await api<ChatListItem>(baseUrl, '/chats', {
        method: 'POST',
        body: JSON.stringify({ title: contact.displayName, participantContacts: [contact.contact] }),
      }, token);
      onOpenChat(chat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть диалог');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Section title="Контакты" subtitle="Быстрый запуск личного диалога на основе загруженных контактов.">
      <SearchBox value={search} onChange={setSearch} placeholder="Поиск контактов" />
      {error && <InlineError text={error} />}
      <div className="list-block mt-16">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)
          : filteredContacts.map((contact) => (
              <button
                key={contact.userID}
                className="list-card"
                onClick={() => openChat(contact)}
                disabled={contact.isCurrentUser || openingId === contact.userID}
              >
                <div className={cn('avatar-circle', contact.isCurrentUser ? 'avatar-green' : 'avatar-blue')}>
                  {getInitials(contact.displayName)}
                </div>
                <div className="list-content">
                  <div className="list-title-row">
                    <div className="font-semibold truncate">{contact.displayName}</div>
                    {contact.isCurrentUser && <span className="chip-green">Вы</span>}
                  </div>
                  <div className="muted text-sm mt-4 truncate">{contact.contact}</div>
                </div>
                <div className="list-action">{openingId === contact.userID ? 'Открытие...' : contact.isCurrentUser ? 'Текущий' : 'Чат'}</div>
              </button>
            ))}
      </div>
    </Section>
  );
}

function ChatsPanel({
  baseUrl,
  token,
  selectedChatID,
  onSelectChat,
  onChatCreated,
}: {
  baseUrl: string;
  token: string;
  selectedChatID: string | null;
  onSelectChat: (chat: ChatListItem) => void;
  onChatCreated: (chat: ChatListItem) => void;
}) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true);
      const suffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      api<ChatListItem[]>(baseUrl, `/chats${suffix}`, { method: 'GET' }, token)
        .then((data) => {
          setChats(data);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить список чатов'))
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [baseUrl, token, search]);

  useEffect(() => {
    api<ContactDTO[]>(baseUrl, '/auth/contacts', { method: 'GET' }, token)
      .then((data) => setContacts(data.filter((contact) => !contact.isCurrentUser)))
      .catch(() => undefined);
  }, [baseUrl, token]);

  async function createGroup() {
    if (title.trim().length === 0 || selectedIds.length < 2) return;
    setCreating(true);
    try {
      const participantContacts = contacts.filter((contact) => selectedIds.includes(contact.userID)).map((contact) => contact.contact);
      const chat = await api<ChatListItem>(baseUrl, '/chats', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), participantContacts }),
      }, token);
      setChats((prev) => [chat, ...prev.filter((item) => item.id !== chat.id)]);
      onChatCreated(chat);
      setIsModalOpen(false);
      setTitle('');
      setSelectedIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать групповой чат');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Section
      title="Чаты"
      subtitle="Список чатов, поиск, unread count и создание групповых бесед."
      action={
        <button className="soft-button blue" onClick={() => setIsModalOpen(true)}>
          <Plus className="icon-16" /> Группа
        </button>
      }
    >
      <SearchBox value={search} onChange={setSearch} placeholder="Поиск чатов" />
      {error && <InlineError text={error} />}

      <div className="list-block mt-16">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)
          : chats.map((chat) => (
              <button
                key={chat.id}
                className={cn('chat-card', selectedChatID === chat.id && 'chat-card-active')}
                onClick={() => onSelectChat(chat)}
              >
                <div className={cn('avatar-square', chat.participantCount > 2 ? 'avatar-group' : 'avatar-blue')}>
                  {chat.participantCount > 2 ? <Users className="icon-18" /> : getInitials(chat.title)}
                </div>
                <div className="list-content">
                  <div className="list-title-row">
                    <div className="font-semibold truncate">{chat.title}</div>
                    <div className="muted text-xs">{relativeDate(chat.updatedAt)}</div>
                  </div>
                  {chat.participantCount > 2 && (
                    <div className="muted text-xs mt-4 truncate">
                      {chat.participantNames.slice(0, 3).join(', ')}{chat.participantNames.length > 3 ? ` +${chat.participantNames.length - 3}` : ''}
                    </div>
                  )}
                  <div className="muted text-sm mt-6 line-clamp-2">
                    {chat.typingParticipants.length
                      ? `Печатает: ${chat.typingParticipants.join(', ')}`
                      : chat.lastMessagePreview || (chat.participantCount > 2 ? 'Групповой чат готов к общению' : 'Напишите первое сообщение')}
                  </div>
                </div>
                {chat.unreadCount > 0 && <div className="badge-unread">{chat.unreadCount}</div>}
              </button>
            ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <Modal title="Новая группа" onClose={() => setIsModalOpen(false)}>
            <div className="input-group">
              <label className="label">Название группы</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Например, Команда iOS" />
            </div>

            <div className="input-group mt-16">
              <label className="label">Участники</label>
              <div className="picker-list">
                {contacts.map((contact) => {
                  const active = selectedIds.includes(contact.userID);
                  return (
                    <button
                      key={contact.userID}
                      className={cn('picker-item', active && 'picker-item-active')}
                      onClick={() => setSelectedIds((prev) => active ? prev.filter((id) => id !== contact.userID) : [...prev, contact.userID])}
                    >
                      <div className="avatar-circle avatar-blue">{getInitials(contact.displayName)}</div>
                      <div className="list-content">
                        <div className="font-medium truncate">{contact.displayName}</div>
                        <div className="muted text-sm mt-4 truncate">{contact.contact}</div>
                      </div>
                      {active && <CheckCircle2 className="icon-18 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="primary-button mt-16" disabled={creating || title.trim().length === 0 || selectedIds.length < 2} onClick={createGroup}>
              {creating ? 'Создание...' : 'Создать группу'}
            </button>
          </Modal>
        )}
      </AnimatePresence>
    </Section>
  );
}

function DialogPanel({
  baseUrl,
  token,
  currentUserID,
  chat,
}: {
  baseUrl: string;
  token: string;
  currentUserID: string;
  chat: ChatListItem | null;
}) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chat) return;
    setLoading(true);
    setBanner(null);
    api<MessageRecord[]>(baseUrl, `/chats/${chat.id}/messages?limit=100`, { method: 'GET' }, token)
      .then((data) => setMessages(data))
      .catch((e) => setBanner(e instanceof Error ? e.message : 'Не удалось загрузить историю'))
      .finally(() => setLoading(false));
  }, [baseUrl, token, chat?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function sendMessage() {
    if (!chat || input.trim().length === 0) return;

    const localId = crypto.randomUUID();
    const optimistic: MessageRecord = {
      id: localId,
      messageID: localId,
      localID: localId,
      chatID: chat.id,
      authorID: currentUserID,
      authorName: 'Вы',
      kind: 'text',
      text: input.trim(),
      status: 'sending',
      createdAt: new Date().toISOString(),
      attachments: [],
    };

    setMessages((prev) => [...prev, optimistic]);
    const messageText = input.trim();
    setInput('');
    setSending(true);

    try {
      const created = await api<MessageRecord>(baseUrl, `/chats/${chat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ messageID: localId, kind: 'text', text: messageText, mediaID: null }),
      }, token);
      setMessages((prev) => prev.map((message) => (message.id === optimistic.id ? created : message)));
      setBanner(null);
    } catch (e) {
      setMessages((prev) => prev.map((message) => (message.id === optimistic.id ? { ...message, status: 'failed' } : message)));
      setBanner(e instanceof Error ? e.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

  if (!chat) {
    return (
      <div className="dialog-empty">
        <div className="dialog-empty-icon"><MessageCircle className="icon-32" /></div>
        <h3 className="dialog-empty-title">Выберите чат</h3>
        <p className="dialog-empty-text">После выбора откроется история сообщений и поле отправки, работающее с backend по REST-маршрутам /chats/*.</p>
      </div>
    );
  }

  return (
    <div className="dialog-wrap">
      <div className="dialog-header">
        <div className={cn('avatar-square large', chat.participantCount > 2 ? 'avatar-group' : 'avatar-blue')}>
          {chat.participantCount > 2 ? <Users className="icon-18" /> : getInitials(chat.title)}
        </div>
        <div>
          <div className="font-semibold text-lg">{chat.title}</div>
          <div className="muted text-sm mt-4">{chat.participantCount > 2 ? `${chat.participantCount} участников` : 'Личный чат'}</div>
        </div>
      </div>

      {banner && <div className="error-box mx-16 mt-16"><AlertTriangle className="icon-16" /> <span>{banner}</span></div>}

      <div className="dialog-messages">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => <MessageSkeleton key={index} outgoing={index % 2 === 0} />)
          : messages.map((message) => {
              const isOutgoing = message.authorID === currentUserID;
              const image = message.attachments?.find((attachment) => attachment.kind === 'image');
              return (
                <div key={message.id} className={cn('message-row', isOutgoing && 'message-row-outgoing')}>
                  <div className={cn('message-bubble', isOutgoing ? 'message-bubble-outgoing' : 'message-bubble-incoming')}>
                    {!isOutgoing && chat.participantCount > 2 && <div className="message-author">{message.authorName}</div>}
                    {image?.url && <img src={image.url} alt="attachment" className="message-image" />}
                    {message.text && <div className="message-text">{message.text}</div>}
                    <div className={cn('message-meta', isOutgoing && 'message-meta-outgoing')}>
                      <span>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                      {isOutgoing && <MessageStatusBadge status={message.status} />}
                    </div>
                  </div>
                </div>
              );
            })}
        <div ref={bottomRef} />
      </div>

      <div className="dialog-input-wrap">
        <button className="media-button" type="button" title="Загрузка изображения пока не добавлена в web UI">
          <ImageIcon className="icon-18" />
        </button>
        <div className="dialog-input-shell">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="dialog-input"
            placeholder="Сообщение"
            rows={1}
          />
          <button className="send-button" onClick={sendMessage} disabled={sending || input.trim().length === 0}>
            <Send className="icon-18" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const labels: Record<MessageStatus, string> = {
    sending: 'отправка',
    sent: 'отправлено',
    delivered: 'доставлено',
    read: 'прочитано',
    failed: 'ошибка',
  };
  return <span>{labels[status]}</span>;
}

function ProfilePanel({ session, connectionStatus }: { session: Session; connectionStatus: ConnectionStatus }) {
  return (
    <Section title="Профиль" subtitle="Минимальный профиль пользователя, совместимый с общей архитектурой клиента.">
      <div className="profile-card mt-8">
        <div className="profile-avatar">{getInitials(session.displayName)}</div>
        <div className="profile-name">{session.displayName}</div>
        <div className="profile-id">{session.userID}</div>

        <div className="profile-grid mt-20">
          <div className="info-card">
            <div className="label">Статус соединения</div>
            <div className="font-semibold mt-8">{connectionStatus}</div>
          </div>
          <div className="info-card">
            <div className="label">Токен</div>
            <div className="mono mt-8">{session.token.slice(0, 24)}...</div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: JSX.Element;
  children: JSX.Element | JSX.Element[];
}) {
  return (
    <div>
      <div className="section-header">
        <div>
          <div className="title-md">{title}</div>
          <div className="muted mt-4">{subtitle}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="search-box mt-16">
      <Search className="icon-16 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} className="search-input" placeholder={placeholder} />
    </div>
  );
}

function InlineError({ text }: { text: string }) {
  return <div className="error-box mt-12"><AlertTriangle className="icon-16" /> <span>{text}</span></div>;
}

function SkeletonRow() {
  return <div className="skeleton-row" />;
}

function MessageSkeleton({ outgoing }: { outgoing: boolean }) {
  return <div className={cn('message-skeleton-row', outgoing && 'message-skeleton-row-outgoing')}><div className="message-skeleton" /></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: JSX.Element | JSX.Element[] }) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal-card" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }}>
        <div className="section-header">
          <div className="title-md">{title}</div>
          <button className="soft-button" onClick={onClose}>Закрыть</button>
        </div>
        <div className="mt-16">{children}</div>
      </motion.div>
    </motion.div>
  );
}
