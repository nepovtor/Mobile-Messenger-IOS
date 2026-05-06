import { MessageSquareText, Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-[78px] w-[78px] items-center justify-center rounded-[30px] border border-white/12 bg-white/[0.06] p-5 shadow-[0_20px_50px_rgba(3,8,20,0.38)]">
        <MessageSquareText className="h-9 w-9 text-cyan-100" />
      </div>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
        <Sparkles className="h-3.5 w-3.5" />
        Workspace ready
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-white">
        Выберите диалог
      </h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
        Слева уже доступны диалоги и контакты. Откройте нужный тред, чтобы
        продолжить переписку, увидеть live-обновления и перейти к карте.
      </p>
    </div>
  );
}
