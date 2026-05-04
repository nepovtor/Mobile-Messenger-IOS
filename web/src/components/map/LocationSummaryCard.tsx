import { Shield } from "lucide-react";
import type { ContactLocation, MyLocationShare } from "../../api/locationApi";
import { formatLocationUpdatedAt } from "../../utils/location";
import { Card } from "../ui/Card";

export function LocationSummaryCard({
  myLocation,
  contacts,
}: {
  myLocation: MyLocationShare | null;
  contacts: ContactLocation[];
}) {
  return (
    <Card className="p-5">
      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
        <Shield className="h-3.5 w-3.5" />
        Privacy
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-white">
        Opt-in location sharing
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Location sharing is off by default. Contacts see only shared location,
        and only the latest point is stored.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
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
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Contacts sharing now
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            {contacts.length}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Contacts appear only while they explicitly share a location.
          </p>
        </div>
      </div>
    </Card>
  );
}
