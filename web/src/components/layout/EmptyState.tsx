import { MessageSquareText, Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 p-5">
        <MessageSquareText className="h-9 w-9 text-cyan-100" />
      </div>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
        <Sparkles className="h-3.5 w-3.5" />
        Demo ready
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-white">
        Pick a conversation
      </h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
        Choose a chat on the left to open the thread, continue the demo flow,
        and show realtime updates landing without refreshing the page.
      </p>
    </div>
  );
}
