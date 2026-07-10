import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type {
  ContactLocation,
  MyLocationShare,
} from "@/features/location/api/locationApi";
import { formatLocationUpdatedAt } from "@/utils/location";
import { Button } from "@/components/ui/Button";

function buildMarker(label: string, tint: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:48px;height:48px;border-radius:18px;background:${tint};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px;box-shadow:0 14px 30px rgba(15,23,42,.32);border:2px solid rgba(255,255,255,.18)">${label}</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -16],
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function LocationMap({
  center,
  myLocation,
  contacts,
  onOpenChat,
}: {
  center: [number, number];
  myLocation: MyLocationShare | null;
  contacts: ContactLocation[];
  onOpenChat: (contact: ContactLocation) => void;
}) {
  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom
      className="h-[560px] w-full rounded-[30px]"
    >
      <RecenterMap center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {myLocation?.sharingEnabled &&
      myLocation.latitude != null &&
      myLocation.longitude != null ? (
        <Marker
          position={[myLocation.latitude, myLocation.longitude]}
          icon={buildMarker("YOU", "linear-gradient(135deg,#22c55e,#0ea5e9)")}
        >
          <Popup>
            <div className="min-w-[220px] space-y-3 p-4">
              <div>
                <p className="font-semibold text-white">Вы</p>
                <p className="mt-1 text-sm text-slate-300">
                  Точка видна контактам только пока sharing включён.
                </p>
              </div>
              <p className="text-xs text-slate-400">
                {formatLocationUpdatedAt(myLocation.updatedAt)}
              </p>
            </div>
          </Popup>
        </Marker>
      ) : null}

      {contacts.map((contact) => (
        <Marker
          key={contact.userID}
          position={[contact.latitude, contact.longitude]}
          icon={buildMarker(
            initials(contact.displayName),
            "linear-gradient(135deg,#f59e0b,#0ea5e9)",
          )}
        >
          <Popup>
            <div className="min-w-[240px] space-y-3 p-4">
              <div>
                <p className="font-semibold text-white">
                  {contact.displayName}
                </p>
                <p className="text-sm text-slate-300">{contact.phone}</p>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <p>{formatLocationUpdatedAt(contact.updatedAt)}</p>
                {contact.accuracy != null ? (
                  <p>Accuracy: ~{Math.round(contact.accuracy)} m</p>
                ) : null}
                {contact.isOutdated ? (
                  <p className="font-semibold text-amber-300">
                    Location outdated
                  </p>
                ) : null}
              </div>
              <Button
                className="w-full px-3 py-2"
                onClick={() => onOpenChat(contact)}
              >
                Открыть чат
              </Button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [center, map]);

  return null;
}
