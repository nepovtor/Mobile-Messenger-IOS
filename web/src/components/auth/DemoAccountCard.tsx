import clsx from "clsx";
import { ArrowRight, KeyRound, Phone } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type DemoAccountCardProps = {
  name: string;
  phone: string;
  code: string;
  onSelect: () => void;
  accentClassName?: string;
};

export function DemoAccountCard({
  name,
  phone,
  code,
  onSelect,
  accentClassName,
}: DemoAccountCardProps) {
  return (
    <Card
      className={clsx(
        "group relative flex h-full flex-col justify-between overflow-hidden border-white/14 p-5 transition duration-200 hover:-translate-y-1 hover:brightness-110",
        "bg-[linear-gradient(150deg,rgba(15,23,42,0.9),rgba(30,41,59,0.76))]",
        accentClassName,
      )}
    >
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{name}</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/70">
              Demo account
            </p>
          </div>
          <span className="rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white">
            Ready
          </span>
        </div>
        <div className="grid gap-2 rounded-3xl border border-white/12 bg-black/20 p-3 text-sm text-slate-100 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-white" />
            <span>{phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-white" />
            <span>{code}</span>
          </div>
        </div>
      </div>
      <Button
        className="mt-5 bg-white/90 text-slate-950 hover:bg-white"
        onClick={onSelect}
      >
        Войти
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Card>
  );
}
