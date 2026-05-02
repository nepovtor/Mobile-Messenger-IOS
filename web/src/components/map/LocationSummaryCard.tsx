import type { ContactLocation, MyLocationShare } from "../../api/locationApi";
import { formatLocationUpdatedAt } from "../../utils/location";

export function LocationSummaryCard({
  myLocation,
  contacts,
}: {
  myLocation: MyLocationShare | null;
  contacts: ContactLocation[];
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
        Privacy
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-white">
        Opt-in location sharing
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Your location is shared only with your contacts while sharing is
        enabled. Sharing updates only when you choose to share or refresh your
        point, and only the latest point is stored.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
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
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Contacts sharing now
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            {contacts.length}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Other contacts appear as Location not shared.
          </p>
        </div>
      </div>
    </div>
  );
}
