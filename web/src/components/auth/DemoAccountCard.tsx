import { ArrowRight, KeyRound, Phone } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type DemoAccountCardProps = {
  name: string;
  phone: string;
  code: string;
  description: string;
  onSelect: () => void;
};

export function DemoAccountCard({
  name,
  phone,
  code,
  description,
  onSelect,
}: DemoAccountCardProps) {
  return (
    <Card className="group flex h-full flex-col justify-between overflow-hidden p-5 transition duration-200 hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-white/10">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar name={name} />
            <div>
              <h3 className="text-lg font-semibold text-white">{name}</h3>
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            </div>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-200">
            Demo
          </span>
        </div>
        <div className="grid gap-2 rounded-3xl border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-cyan-200" />
            <span>{phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-200" />
            <span>{code}</span>
          </div>
        </div>
      </div>
      <Button className="mt-5" variant="secondary" onClick={onSelect}>
        Quick sign in
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Card>
  );
}
