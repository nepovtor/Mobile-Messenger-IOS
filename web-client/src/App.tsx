import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Plus,
  Search,
  SendHorizonal,
  Settings,
  Shield,
  Smartphone,
  UserCircle2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

type AuthMethod = "phone" | "email";
type AuthScreenMode = "signIn" | "signUp";
type AuthCredentialMode = "password" | "code";
type TabKey = "chats" | "contacts" | "profile";
type ConnectionStatus = "online" | "connecting" | "reconnecting" | "offline";
type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

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
  kind: "image";
  url?: string | null;
};

type MessageRecord = {
  id: string;
  chatID: string;
  authorID: string;
  authorName: string;
  kind: "text" | "image";
  text: string;
  createdAt: string;
  status: MessageStatus;
  attachments?: MessageAttachment[];
};

const DEFAULT_BASE_URL = "https://mobile-messenger-ios-production.up.railway.app/api";
const STORAGE_SESSION = "mobile_messenger_web_session";
const STORAGE_BASE_URL = "mobile_messenger_web_base_url";

const DEMO_ACCOUNTS = [
  { displayName: "Анна Demo", contact: "+15551230011", password: "demo1111" },
  { displayName: "Борис Demo", contact: "+15551230012", password: "demo2222" },
  { displayName: "Вера Demo", contact: "+15551230013", password: "demo3333" },
  { displayName: "Глеб Demo", contact: "+15551230014", password: "demo4444" },
] as const;

function cn(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function safeJSON<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function initials(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function sanitizeContact(contact: string, method: AuthMethod) {
  const trimmed = contact.trim();
  return method === "phone" ? trimmed.replace(/[^+\d]/g, "") : trimmed.toLowerCase();
}

function relativeDate(date: string) {
  const target = new Date(date).getTime();
  const diff = target - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
  if (abs > 1000 * 60 * 60 * 24) return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24)), "day");
  if (abs > 1000 * 60 * 60) return rtf.format(Math.round(diff / (1000 * 60 * 60)), "hour");
  return rtf.format(Math.round(diff / (1000 * 60)), "minute");
}

function normalizeChat(raw: any): ChatListItem {
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    title: String(raw?.title ?? "Без названия"),
    lastMessagePreview:
      raw?.lastMessagePreview == null ? null : String(raw.lastMessagePreview),
    updatedAt: String(raw?.updatedAt ?? raw?.lastActivity ?? new Date().toISOString()),
    unreadCount: Number(raw?.unreadCount ?? 0),
    typingParticipants: Array.isArray(raw?.typingParticipants)
      ? raw.typingParticipants.map(String)
      : [],
    participantNames: Array.isArray(raw?.participantNames)
      ? raw.participantNames.map(String)
      : [],
    participantCount: Number(
      raw?.participantCount ??
        (Array.isArray(raw?.participantNames) && raw.participantNames.length > 0
          ? raw.participantNames.length
          : 1)
    ),
  };
}

function normalizeMessage(raw: any): MessageRecord {
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    chatID: String(raw?.chatID ?? ""),
    authorID: String(raw?.authorID ?? ""),
    authorName: String(raw?.authorName ?? "Unknown"),
    kind: raw?.kind === "image" ? "image" : "text",
    text: String(raw?.text ?? ""),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    status:
      raw?.status === "sending" ||
      raw?.status === "sent" ||
      raw?.status === "delivered" ||
      raw?.status === "read" ||
      raw?.status === "failed"
        ? raw.status
        : "sent",
    attachments: Array.isArray(raw?.attachments)
      ? raw.attachments
          .filter((item: any) => item?.kind === "image")
          .map((item: any) => ({
            id: String(item?.id ?? crypto.randomUUID()),
            kind: "image" as const,
            url: item?.url ? String(item.url) : null,
          }))
      : raw?.mediaURL
      ? [
          {
            id: String(raw?.mediaID ?? raw?.id ?? crypto.randomUUID()),
            kind: "image" as const,
            url: String(raw.mediaURL),
          },
        ]
      : [],
  };
}

async function api<T>(baseUrl: string, path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, {
    ...init,
    headers,
  });

  const raw = await response.text();
  const parsed = raw ? safeJSON(raw, raw) : null;

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as any).message)
        : raw || `Ошибка ${response.status}`;
    throw new Error(message);
  }

  return parsed as T;
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(STORAGE_BASE_URL) || DEFAULT_BASE_URL);
  const [session, setSession] = useState<Session | null>(() => safeJSON(localStorage.getItem(STORAGE_SESSION), null));
  const [activeTab, setActiveTab] = useState<TabKey>("chats");
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(navigator.onLine ? "connecting" : "offline");

  useEffect(() => {
    localStorage.setItem(STORAGE_BASE_URL, baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_SESSION);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setConnectionStatus("offline");
      return;
    }

    let mounted = true;
    setConnectionStatus(navigator.onLine ? "connecting" : "offline");

    api<any>(baseUrl, "health", { method: "GET" }, session.token)
      .then(() => mounted && setConnectionStatus("online"))
      .catch(() => mounted && setConnectionStatus(navigator.onLine ? "reconnecting" : "offline"));

    return () => {
      mounted = false;
    };
  }, [baseUrl, session]);

  useEffect(() => {
    const onOnline = () => setConnectionStatus(session ? "reconnecting" : "offline");
    const onOffline = () => setConnectionStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [session]);

  if (!session) {
    return <AuthScreen baseUrl={baseUrl} setBaseUrl={setBaseUrl} onAuth={setSession} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.16),transparent_26%),linear-gradient(180deg,#f7fbff_0%,#eef5ff_44%,#f9fbff_100%)]">
        <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-8 right-0 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-4 p-4 xl:grid-cols-[280px_420px_minmax(0,1fr)]">
          <Sidebar
            session={session}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            connectionStatus={connectionStatus}
            onLogout={() => {
              setSession(null);
              setSelectedChat(null);
            }}
          />

          {activeTab === "contacts" ? (
            <ContactsPane
              baseUrl={baseUrl}
              token={session.token}
              onChatOpen={(chat) => {
                setSelectedChat(chat);
                setActiveTab("chats");
              }}
            />
          ) : activeTab === "profile" ? (
            <ProfilePane session={session} connectionStatus={connectionStatus} />
          ) : (
            <ChatsPane
              baseUrl={baseUrl}
              token={session.token}
              selectedChatID={selectedChat?.id ?? null}
              onSelectChat={setSelectedChat}
              onCreateChat={setSelectedChat}
            />
          )}

          <DialoguePane baseUrl={baseUrl} token={session.token} currentUserID={session.userID} chat={selectedChat} />
        </div>
      </div>
    </div>
  );
}

function AuthScreen({
  baseUrl,
  setBaseUrl,
  onAuth,
}: {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  onAuth: (session: Session) => void;
}) {
  const [screenMode, setScreenMode] = useState<AuthScreenMode>("signIn");
  const [credentialMode, setCredentialMode] = useState<AuthCredentialMode>("password");
  const [method, setMethod] = useState<AuthMethod>("phone");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"idle" | "request" | "verify" | "login">("idle");

  const passwordFlow = screenMode === "signIn" && credentialMode === "password";
  const contactValid = method === "phone" ? contact.replace(/\D/g, "").length >= 10 : contact.includes("@") && contact.includes(".");

  async function requestCode() {
    setError(null);
    setLoading("request");
    try {
      const result = await api<{ expiresIn?: number | null }>(baseUrl, "auth/request", {
        method: "POST",
        body: JSON.stringify({ method, contact: sanitizeContact(contact, method) }),
      });
      setCodeSent(true);
      setExpiresIn(result?.expiresIn ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса кода");
    } finally {
      setLoading("idle");
    }
  }

  async function verifyCode() {
    setError(null);
    setLoading("verify");
    try {
      const result = await api<Session>(baseUrl, "auth/verify", {
        method: "POST",
        body: JSON.stringify({ method, contact: sanitizeContact(contact, method), code: code.trim() }),
      });
      onAuth(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка подтверждения");
    } finally {
      setLoading("idle");
    }
  }

  async function login() {
    setError(null);
    setLoading("login");
    try {
      const result = await api<Session>(baseUrl, "auth/login", {
        method: "POST",
        body: JSON.stringify({ method, contact: sanitizeContact(contact, method), password: password.trim() }),
      });
      onAuth(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    } finally {
      setLoading("idle");
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.35),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(103,232,249,0.18),transparent_24%),radial-gradient(circle_at_50%_80%,rgba(147,51,234,0.18),transparent_28%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm backdrop-blur-xl">
              <Shield className="h-4 w-4" />
              Messenger Web Platform
            </div>
            <h1 className="mt-10 max-w-2xl text-6xl font-semibold leading-[1.05]">
              Адекватный и взрослый интерфейс
              <span className="block text-blue-300">для вашего iOS-мессенджера</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Чистый auth-screen, стеклянные панели, нормальная типографика, аккуратный список чатов и визуально цельный диалоговый интерфейс.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <GlassMetric title="Авторизация" text="Пароль и код подтверждения" icon={<Lock className="h-5 w-5" />} />
            <GlassMetric title="Контакты" text="Быстрый запуск диалогов" icon={<Users className="h-5 w-5" />} />
            <GlassMetric title="Чаты" text="Unread, typing, groups" icon={<MessageCircle className="h-5 w-5" />} />
            <GlassMetric title="Backend ready" text="Работа через REST API" icon={<Settings className="h-5 w-5" />} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8 lg:p-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl rounded-[32px] border border-white/60 bg-white/85 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">Mobile Messenger</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">Вход в систему</div>
              <div className="mt-2 text-sm text-slate-500">Подключение веб-клиента к вашему backend.</div>
            </div>
            <div className="w-full rounded-2xl border border-slate-200 bg-white/80 p-2 sm:w-auto">
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full min-w-[260px] bg-transparent px-2 py-1 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] bg-slate-50/85 p-4">
              <Segment
                value={screenMode}
                onChange={(next) => {
                  setScreenMode(next as AuthScreenMode);
                  setCredentialMode(next === "signUp" ? "code" : "password");
                  setCodeSent(false);
                  setCode("");
                  setError(null);
                }}
                items={[
                  { value: "signIn", label: "Sign In" },
                  { value: "signUp", label: "Sign Up" },
                ]}
              />

              {screenMode === "signIn" && (
                <div className="mt-3">
                  <Segment
                    value={credentialMode}
                    onChange={(next) => {
                      setCredentialMode(next as AuthCredentialMode);
                      setCodeSent(false);
                      setCode("");
                      setError(null);
                    }}
                    items={[
                      { value: "password", label: "Password" },
                      { value: "code", label: "Code" },
                    ]}
                  />
                </div>
              )}

              <div className="mt-3">
                <Segment
                  value={method}
                  onChange={(next) => setMethod(next as AuthMethod)}
                  items={[
                    { value: "phone", label: "Телефон", icon: <Smartphone className="h-4 w-4" /> },
                    { value: "email", label: "E-mail", icon: <Mail className="h-4 w-4" /> },
                  ]}
                />
              </div>

              <div className="mt-5 space-y-4">
                <Field label={method === "phone" ? "Номер телефона" : "E-mail"}>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-400"
                    placeholder={method === "phone" ? "+375 ..." : "name@example.com"}
                  />
                </Field>

                {passwordFlow ? (
                  <Field label="Пароль">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-400"
                      placeholder="Введите пароль"
                    />
                  </Field>
                ) : (
                  <>
                    <button
                      onClick={requestCode}
                      disabled={!contactValid || loading !== "idle"}
                      className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" />
                      {loading === "request" ? "Отправка..." : codeSent ? "Отправить код снова" : "Запросить код"}
                    </button>
                    <Field label="Код подтверждения">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-400"
                        placeholder="Введите код"
                      />
                    </Field>
                    {expiresIn !== null && (
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        Код отправлен. Время действия: {expiresIn} секунд.
                      </div>
                    )}
                  </>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={passwordFlow ? login : verifyCode}
                  disabled={!contactValid || loading !== "idle" || (passwordFlow ? password.trim().length < 4 : code.trim().length < 4)}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {loading === "login" ? "Вход..." : loading === "verify" ? "Проверка..." : passwordFlow ? "Войти" : "Подтвердить"}
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-4">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Demo Accounts</div>
              <div className="mt-3 space-y-3">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.contact}
                    onClick={() => {
                      setScreenMode("signIn");
                      setCredentialMode("password");
                      setMethod("phone");
                      setContact(account.contact);
                      setPassword(account.password);
                      setError(null);
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/60"
                  >
                    <div className="font-semibold text-slate-900">{account.displayName}</div>
                    <div className="mt-1 text-sm text-slate-500">{account.contact}</div>
                    <div className="mt-2 text-xs text-slate-400">Пароль: {account.password}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Sidebar({
  session,
  baseUrl,
  setBaseUrl,
  activeTab,
  setActiveTab,
  connectionStatus,
  onLogout,
}: {
  session: Session;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  activeTab: TabKey;
  setActiveTab: (v: TabKey) => void;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
}) {
  const items = [
    { key: "chats", label: "Чаты", icon: <MessageCircle className="h-4 w-4" /> },
    { key: "contacts", label: "Контакты", icon: <Users className="h-4 w-4" /> },
    { key: "profile", label: "Профиль", icon: <UserCircle2 className="h-4 w-4" /> },
  ] as const;

  return (
    <GlassPanel className="flex h-full flex-col p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Mobile Messenger</div>
        <div className="mt-2 text-2xl font-semibold text-slate-900">Web Client</div>
        <div className="mt-2 text-sm leading-6 text-slate-500">Более зрелый и визуально цельный интерфейс для работы с backend.</div>
      </div>

      <div className="mt-5">
        <StatusPill status={connectionStatus} />
      </div>

      <div className="mt-5 rounded-[24px] bg-slate-900 p-4 text-white shadow-xl shadow-slate-900/20">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Аккаунт</div>
        <div className="mt-2 text-lg font-semibold">{session.displayName}</div>
        <div className="mt-1 break-all text-xs text-slate-400">{session.userID}</div>
      </div>

      <div className="mt-5 space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition",
              activeTab === item.key ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white/70 text-slate-700 hover:bg-white"
            )}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white/80 p-4">
        <div className="text-sm font-medium text-slate-700">REST base URL</div>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
      </div>

      <div className="mt-auto pt-5">
        <button
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-medium text-rose-700 transition hover:bg-rose-100"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </div>
    </GlassPanel>
  );
}

function ContactsPane({
  baseUrl,
  token,
  onChatOpen,
}: {
  baseUrl: string;
  token: string;
  onChatOpen: (chat: ChatListItem) => void;
}) {
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api<ContactDTO[]>(baseUrl, "auth/contacts", { method: "GET" }, token)
      .then((data) => mounted && setContacts(Array.isArray(data) ? data : []))
      .catch((e) => mounted && setError(e instanceof Error ? e.message : "Не удалось загрузить контакты"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [baseUrl, token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.displayName.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q));
  }, [contacts, search]);

  async function openChat(contact: ContactDTO) {
    if (contact.isCurrentUser) return;
    const createdRaw = await api<any>(baseUrl, "chats", {
      method: "POST",
      body: JSON.stringify({ title: contact.displayName, participantContacts: [contact.contact] }),
    }, token);
    onChatOpen(normalizeChat(createdRaw));
  }

  return (
    <GlassPanel className="p-5">
      <PaneHeader title="Контакты" subtitle="Быстрое создание личных диалогов из списка контактов." />
      <SearchBox value={search} onChange={setSearch} placeholder="Поиск контактов" />
      {error && <ErrorBox text={error} />}
      <div className="mt-4 space-y-3 overflow-auto pr-1">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => <PlaceholderCard key={i} />)
          : filtered.map((contact) => (
              <button
                key={contact.userID}
                onClick={() => openChat(contact)}
                disabled={contact.isCurrentUser}
                className="flex w-full items-center gap-4 rounded-[24px] border border-white/70 bg-white/85 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70"
              >
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold", contact.isCurrentUser ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
                  {initials(contact.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900">{contact.displayName}</div>
                  <div className="mt-1 truncate text-sm text-slate-500">{contact.contact}</div>
                </div>
                <div className="text-xs font-semibold text-slate-400">{contact.isCurrentUser ? "Вы" : "Открыть"}</div>
              </button>
            ))}
      </div>
    </GlassPanel>
  );
}

function ChatsPane({
  baseUrl,
  token,
  selectedChatID,
  onSelectChat,
  onCreateChat,
}: {
  baseUrl: string;
  token: string;
  selectedChatID: string | null;
  onSelectChat: (chat: ChatListItem) => void;
  onCreateChat: (chat: ChatListItem) => void;
}) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      api<any[]>(baseUrl, `chats${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`, { method: "GET" }, token)
        .then((data) => {
          setChats(Array.isArray(data) ? data.map(normalizeChat) : []);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить чаты"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [baseUrl, token, search]);

  useEffect(() => {
    api<ContactDTO[]>(baseUrl, "auth/contacts", { method: "GET" }, token)
      .then((data) => setContacts(Array.isArray(data) ? data.filter((x) => !x.isCurrentUser) : []))
      .catch(() => undefined);
  }, [baseUrl, token]);

  async function createGroup() {
    const participantContacts = contacts.filter((c) => selectedContacts.includes(c.userID)).map((c) => c.contact);
    const createdRaw = await api<any>(baseUrl, "chats", {
      method: "POST",
      body: JSON.stringify({ title: groupTitle.trim(), participantContacts }),
    }, token);
    const created = normalizeChat(createdRaw);
    setShowCreate(false);
    setGroupTitle("");
    setSelectedContacts([]);
    onCreateChat(created);
  }

  return (
    <>
      <GlassPanel className="p-5">
        <PaneHeader
          title="Чаты"
          subtitle="Список активных диалогов, групп и состояний набора текста."
          right={
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200"
            >
              <Plus className="h-4 w-4" />
              Группа
            </button>
          }
        />
        <SearchBox value={search} onChange={setSearch} placeholder="Поиск чатов" />
        {error && <ErrorBox text={error} />}
        <div className="mt-4 space-y-3 overflow-auto pr-1">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => <PlaceholderCard key={i} />)
            : chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat)}
                  className={cn(
                    "w-full rounded-[26px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
                    selectedChatID === chat.id ? "border-blue-300 bg-blue-50/80" : "border-white/70 bg-white/85"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl font-bold", chat.participantCount > 2 ? "bg-gradient-to-br from-blue-600 to-cyan-400 text-white" : "bg-blue-100 text-blue-700")}>
                      {chat.participantCount > 2 ? <Users className="h-5 w-5" /> : initials(chat.title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{chat.title}</div>
                          {chat.participantCount > 2 && (
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {chat.participantNames.slice(0, 3).join(", ")}
                              {chat.participantNames.length > 3 ? ` +${chat.participantNames.length - 3}` : ""}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-xs text-slate-400">{relativeDate(chat.updatedAt)}</div>
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                        {chat.typingParticipants.length > 0 ? `Печатает: ${chat.typingParticipants.join(", ")}` : chat.lastMessagePreview || "Диалог без сообщений"}
                      </div>
                    </div>
                    {chat.unreadCount > 0 && (
                      <div className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold text-white">{chat.unreadCount}</div>
                    )}
                  </div>
                </button>
              ))}
        </div>
      </GlassPanel>

      <AnimatePresence>
        {showCreate && (
          <Modal title="Новая группа" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <Field label="Название группы">
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400"
                  placeholder="Например, Команда iOS"
                />
              </Field>

              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">Участники</div>
                <div className="max-h-80 space-y-2 overflow-auto rounded-2xl border border-slate-200 p-3">
                  {contacts.map((contact) => {
                    const active = selectedContacts.includes(contact.userID);
                    return (
                      <button
                        key={contact.userID}
                        onClick={() => setSelectedContacts((prev) => active ? prev.filter((x) => x !== contact.userID) : [...prev, contact.userID])}
                        className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition", active ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50")}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-semibold">{initials(contact.displayName)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{contact.displayName}</div>
                          <div className="truncate text-sm text-slate-500">{contact.contact}</div>
                        </div>
                        {active && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={createGroup}
                disabled={groupTitle.trim().length === 0 || selectedContacts.length < 2}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Создать группу
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

function DialoguePane({
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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chat) return;
    setLoading(true);
    setError(null);
    api<any[]>(baseUrl, `chats/${chat.id}/messages?limit=100`, { method: "GET" }, token)
      .then((data) => setMessages(Array.isArray(data) ? data.map(normalizeMessage) : []))
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить историю"))
      .finally(() => setLoading(false));
  }, [baseUrl, token, chat?.id]);

  async function sendMessage() {
    if (!chat || !input.trim()) return;
    const optimisticId = crypto.randomUUID();
    const text = input.trim();
    const optimistic: MessageRecord = {
      id: optimisticId,
      chatID: chat.id,
      authorID: currentUserID,
      authorName: "Вы",
      kind: "text",
      text,
      createdAt: new Date().toISOString(),
      status: "sending",
      attachments: [],
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const createdRaw = await api<any>(baseUrl, `chats/${chat.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ messageID: optimisticId, kind: "text", text }),
      }, token);
      const created = normalizeMessage(createdRaw);
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? created : m)));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, status: "failed" } : m)));
      setError(e instanceof Error ? e.message : "Не удалось отправить сообщение");
    }
  }

  if (!chat) {
    return (
      <GlassPanel className="flex items-center justify-center p-10">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-blue-100 text-blue-700">
            <MessageCircle className="h-9 w-9" />
          </div>
          <div className="mt-5 text-2xl font-semibold text-slate-900">Выберите чат</div>
          <div className="mt-3 text-sm leading-7 text-slate-500">
            Справа отображается уже более аккуратный экран диалога: большая шапка, мягкий фон, читаемые bubbles и нормальная нижняя панель отправки.
          </div>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="overflow-hidden p-0">
      <div className="border-b border-white/60 bg-white/70 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl font-bold", chat.participantCount > 2 ? "bg-gradient-to-br from-blue-600 to-cyan-400 text-white" : "bg-blue-100 text-blue-700")}>
            {chat.participantCount > 2 ? <Users className="h-5 w-5" /> : initials(chat.title)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xl font-semibold text-slate-900">{chat.title}</div>
            <div className="mt-1 truncate text-sm text-slate-500">
              {chat.participantCount > 2 ? `${chat.participantCount} участников` : "Личный диалог"}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex h-[calc(100vh-8rem)] flex-col xl:h-[calc(100vh-2rem)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.32),rgba(239,246,255,0.52))]" />

        <div className="relative flex-1 space-y-4 overflow-auto px-5 py-5">
          {error && <ErrorBox text={error} />}
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <MessagePlaceholder key={i} outgoing={i % 2 === 0} />)
            : messages.map((message) => {
                const outgoing = message.authorID === currentUserID;
                const image = message.attachments?.find((a) => a.kind === "image");
                return (
                  <div key={message.id} className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "max-w-[78%] rounded-[28px] px-4 py-3 shadow-lg",
                        outgoing ? "bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-blue-200/60" : "bg-white/90 text-slate-900 shadow-slate-200/60"
                      )}
                    >
                      {chat.participantCount > 2 && !outgoing && <div className="mb-1 text-xs font-semibold text-blue-700">{message.authorName}</div>}
                      {image?.url && <img src={image.url} alt="attachment" className="mb-3 max-h-72 w-full rounded-2xl object-cover" />}
                      {message.text && <div className="whitespace-pre-wrap text-sm leading-7">{message.text}</div>}
                      <div className={cn("mt-2 flex items-center gap-2 text-[11px]", outgoing ? "text-white/80" : "text-slate-400")}>
                        <span>{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                        {outgoing && <MessageState status={message.status} />}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
        </div>

        <div className="relative border-t border-white/60 bg-white/75 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-end gap-3 rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-xl shadow-slate-200/70">
            <button className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200" type="button">
              <ImageIcon className="h-5 w-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Сообщение"
              className="min-h-[44px] max-h-36 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-300 disabled:opacity-50"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

function ProfilePane({ session, connectionStatus }: { session: Session; connectionStatus: ConnectionStatus }) {
  return (
    <GlassPanel className="p-5">
      <PaneHeader title="Профиль" subtitle="Информация о текущей сессии и состоянии подключения." />
      <div className="mt-4 rounded-[28px] bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-2xl shadow-slate-900/20">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-white/10 text-2xl font-bold">
            {initials(session.displayName)}
          </div>
          <div>
            <div className="text-2xl font-semibold">{session.displayName}</div>
            <div className="mt-1 text-sm text-slate-300">Пользователь веб-клиента</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <InfoCard title="Статус соединения" value={statusTitle(connectionStatus)} />
        <InfoCard title="Токен" value={session.token.slice(0, 24) + "..."} />
        <InfoCard title="User ID" value={session.userID} className="md:col-span-2" />
      </div>
    </GlassPanel>
  );
}

function statusTitle(status: ConnectionStatus) {
  switch (status) {
    case "online":
      return "Онлайн";
    case "connecting":
      return "Подключение";
    case "reconnecting":
      return "Переподключение";
    case "offline":
      return "Офлайн";
  }
}

function Segment({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (next: string) => void;
  items: Array<{ value: string; label: string; icon?: React.ReactNode }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 shadow-sm">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
            value === item.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function GlassMetric({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
      <div className="inline-flex rounded-2xl bg-white/10 p-3">{icon}</div>
      <div className="mt-4 text-lg font-semibold">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-300">{text}</div>
    </div>
  );
}

function GlassPanel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[32px] border border-white/60 bg-white/70 shadow-2xl shadow-slate-200/70 backdrop-blur-2xl", className)}>{children}</div>;
}

function PaneHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-2xl font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</div>
      </div>
      {right}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
      <Search className="h-4 w-4 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none" />
    </div>
  );
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  const map = {
    online: { label: "Онлайн", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Wifi className="h-4 w-4" /> },
    connecting: { label: "Подключение", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <Wifi className="h-4 w-4" /> },
    reconnecting: { label: "Переподключение", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Wifi className="h-4 w-4" /> },
    offline: { label: "Офлайн", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: <WifiOff className="h-4 w-4" /> },
  } as const;
  const current = map[status];
  return <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold", current.cls)}>{current.icon}{current.label}</div>;
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <AlertTriangle className="mt-0.5 h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}

function PlaceholderCard() {
  return (
    <div className="animate-pulse rounded-[24px] border border-white/70 bg-white/80 p-4">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded-full bg-slate-200" />
          <div className="h-3 w-52 rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function MessagePlaceholder({ outgoing }: { outgoing: boolean }) {
  return (
    <div className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
      <div className="animate-pulse rounded-[28px] bg-white/80 px-4 py-4 shadow-sm">
        <div className="h-4 w-48 rounded-full bg-slate-200" />
        <div className="mt-2 h-4 w-64 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

function MessageState({ status }: { status: MessageStatus }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 opacity-80" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5" />;
  if (status === "failed") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <span className="text-[10px] uppercase tracking-wide">...</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="w-full max-w-2xl rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="text-2xl font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">Закрыть</button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function InfoCard({ title, value, className }: { title: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-[24px] border border-slate-200 bg-white/85 p-5", className)}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="mt-3 break-all text-sm leading-7 text-slate-800">{value}</div>
    </div>
  );
}