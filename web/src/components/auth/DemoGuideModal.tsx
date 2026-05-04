import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const steps = [
  "Login as Анна Demo",
  "Open chats or contacts",
  "Send a realtime message",
] as const;

export function DemoGuideModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-guide-title"
            onClick={(event) => event.stopPropagation()}
          >
            <Card className="overflow-hidden p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Demo Guide
                  </div>
                  <h2
                    id="demo-guide-title"
                    className="mt-4 text-2xl font-semibold text-white"
                  >
                    Three steps to a smooth defense flow
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close demo guide"
                  className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 px-4 py-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-sm font-semibold text-slate-950">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{step}</p>
                    </div>
                    {index < steps.length - 1 ? (
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                    ) : (
                      <MessageCircle className="h-4 w-4 text-cyan-200" />
                    )}
                  </div>
                ))}
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-300">
                Use the demo cards for instant access, then switch to contacts
                or the map to show the full product scope.
              </p>

              <Button className="mt-6 w-full" onClick={onClose}>
                Start demo flow
              </Button>
            </Card>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
