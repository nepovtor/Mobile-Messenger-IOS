import { motion } from "framer-motion";
import { useState } from "react";
import appIcon from "../../../../../MobileMessengerIOS/Assets.xcassets/AppIcon.appiconset/icon-180.png";
import { LoginForm } from "@/features/auth/ui/LoginForm";
import { Card } from "@/components/ui/Card";
import { authStore } from "@/features/auth/model/authStore";

type PendingAction = "pairing" | "code" | "verify" | null;

export function LoginPage() {
  const {
    requestTelegramPairing,
    requestCode,
    verifyCode,
    isLoading,
    error,
    telegramStartUrl,
    clearTelegramPairing,
    clearError,
  } = authStore();
  const [status, setStatus] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const resetFeedback = () => {
    if (error) {
      clearError();
    }
    setStatus(null);
  };

  const handlePhoneEdit = () => {
    resetFeedback();
    setCodeSent(false);
    clearTelegramPairing();
  };

  return (
    <div className="app-page app-page--auth px-4 py-6 sm:px-6 sm:py-8">
      <div className="glass-orb left-[4%] top-[8%] h-52 w-52 bg-sky-400/16" />
      <div className="glass-orb right-[8%] top-[14%] h-64 w-64 bg-cyan-300/14" />
      <div className="glass-orb bottom-[10%] left-[18%] h-56 w-56 bg-teal-300/10" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col sm:min-h-[calc(100vh-4rem)]">
        <motion.header
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full max-w-[420px] items-center gap-4"
        >
          <img
            src={appIcon}
            alt=""
            aria-hidden="true"
            className="h-14 w-14 rounded-[20px] shadow-[0_18px_40px_rgba(6,14,28,0.36)]"
            draggable={false}
          />
          <div className="text-lg font-semibold tracking-[-0.02em] text-white">
            Mobile Messenger
          </div>
        </motion.header>

        <main className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[420px]"
          >
            <Card className="app-shell relative overflow-hidden border-white/12 px-4 py-4 sm:px-5 sm:py-5">
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.08),transparent_34%)]" />
              <div className="relative">
                <LoginForm
                  isLoading={isLoading}
                  error={compactAuthMessage(error)}
                  status={status}
                  codeSent={codeSent}
                  pendingAction={pendingAction}
                  telegramStartUrl={telegramStartUrl}
                  showTelegramButton
                  onResetFeedback={resetFeedback}
                  onPhoneEdit={handlePhoneEdit}
                  onPrepareTelegram={async ({ phone }) => {
                    if (telegramStartUrl) {
                      return;
                    }

                    resetFeedback();
                    setPendingAction("pairing");
                    try {
                      await requestTelegramPairing(phone.trim());
                      setCodeSent(false);
                      setStatus(
                        "Нажмите «Открыть Telegram» и отправьте боту свой контакт.",
                      );
                    } finally {
                      setPendingAction(null);
                    }
                  }}
                  onRequestCode={async ({ phone }) => {
                    resetFeedback();
                    const normalizedPhone = phone.trim();
                    setCodeSent(false);
                    setPendingAction("code");
                    try {
                      const response = await requestCode(normalizedPhone);
                      setCodeSent(true);
                      setStatus(
                        response.debugCode
                          ? `Код: ${response.debugCode}`
                          : "Код отправлен",
                      );
                    } finally {
                      setPendingAction(null);
                    }
                  }}
                  onVerifyCode={async ({ phone, code }) => {
                    resetFeedback();
                    setPendingAction("verify");
                    try {
                      await verifyCode(phone.trim(), code.trim());
                    } finally {
                      setPendingAction(null);
                    }
                  }}
                />
              </div>
            </Card>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function compactAuthMessage(message: string | null) {
  if (!message) {
    return null;
  }

  if (
    /international format|valid phone number|E\.164|start with \+|международном формате/i.test(
      message,
    )
  ) {
    return "Введите номер с +";
  }

  if (
    /link telegram|send your own contact to the bot before requesting a code/i.test(
      message,
    )
  ) {
    return "Номер ещё не привязан к Telegram. Откройте Telegram и отправьте боту свой контакт.";
  }

  if (/telegram pairing unavailable/i.test(message)) {
    return "Telegram-вход временно не настроен на сервере.";
  }

  if (/(invalid|incorrect).*(code)|код.*(невер|ошиб)/i.test(message)) {
    return "Неверный код.";
  }

  if (/expired|ист(е|ё)к/i.test(message)) {
    return "Код истёк";
  }

  if (/too many requests/i.test(message)) {
    return "Слишком много попыток";
  }

  if (/sign in failed|authentication request/i.test(message)) {
    return "Не удалось войти";
  }

  return message;
}
