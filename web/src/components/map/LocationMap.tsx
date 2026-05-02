import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { ContactLocation, MyLocationShare } from "../../api/locationApi";
import { formatLocationUpdatedAt } from "../../utils/location";
import { Button } from "../ui/Button";

function buildMarker(label: string, tint: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;border-radius:999px;background:${tint};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px;box-shadow:0 12px 24px rgba(15,23,42,.26);border:2px solid rgba(255,255,255,.25)">${label}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
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
      className="h-[560px] w-full rounded-[28px]"
    >
      <RecenterMap center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {myLocation?.sharingEnabled &&
      myLocation.latitude != null &&
      myLocation.longitude != null ? (
        <Marker
          position={[myLocation.latitude, myLocation.longitude]}
          icon={buildMarker("ME", "linear-gradient(135deg,#22c55e,#0ea5e9)")}
        >
          <Popup>
            <div className="space-y-2">
              <p className="font-semibold">You</p>
              <p className="text-sm text-slate-600">
                Shared with contacts while sharing is enabled.
              </p>
              <p className="text-xs text-slate-500">
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
          icon={buildMarker(initials(contact.displayName), "#2563eb")}
        >
          <Popup>
            <div className="min-w-[220px] space-y-3">
              <div>
                <p className="font-semibold text-slate-900">
                  {contact.displayName}
                </p>
                <p className="text-sm text-slate-600">{contact.phone}</p>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                <p>{formatLocationUpdatedAt(contact.updatedAt)}</p>
                {contact.accuracy != null ? (
                  <p>Accuracy: ~{Math.round(contact.accuracy)} m</p>
                ) : null}
                {contact.isOutdated ? (
                  <p className="font-semibold text-amber-600">
                    Location outdated
                  </p>
                ) : null}
              </div>
              <Button
                className="w-full px-3 py-2"
                onClick={() => onOpenChat(contact)}
              >
                Open chat
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
