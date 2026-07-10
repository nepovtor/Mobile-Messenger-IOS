import { Shield } from "lucide-react";
import type {
  ContactLocation,
  MyLocationShare,
} from "@/features/location/api/locationApi";
import { formatLocationUpdatedAt } from "@/utils/location";
import { Card } from "@/components/ui/Card";

export function LocationSummaryCard({
  myLocation,
  contacts,
}: {
  myLocation: MyLocationShare | null;
  contacts: ContactLocation[];
}) {
  return (
    <Card className="p-5">
      <div className="app-kicker">
        <Shield className="h-3.5 w-3.5" />
        Privacy model
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-white">
        Геопозиция только по вашему действию
      </h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">
        Локация выключена по умолчанию. Контакты видят только явно
        опубликованную точку, а сервер хранит только последнее состояние.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
          <p className="app-mono text-xs uppercase tracking-[0.22em] text-slate-400">
            My status
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            {myLocation?.sharingEnabled ? "Sharing enabled" : "Sharing off"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {formatLocationUpdatedAt(myLocation?.updatedAt ?? null)}
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
          <p className="app-mono text-xs uppercase tracking-[0.22em] text-slate-400">
            Contacts live now
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            {contacts.length}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            В списке отображаются только те контакты, кто делится точкой прямо
            сейчас.
          </p>
        </div>
      </div>
    </Card>
  );
}
