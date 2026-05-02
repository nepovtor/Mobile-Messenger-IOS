import { MessageSquareText } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 p-5">
        <MessageSquareText className="h-8 w-8 text-cyan-200" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold text-white">
        Pick a conversation
      </h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
        Choose a chat on the left to open the thread, continue the demo flow,
        and watch realtime updates land without refreshing the page.
      </p>
    </div>
  );
}
