import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { chatApi } from "../api/chatApi";
import type { ContactLocation } from "../api/locationApi";
import { UserMenu } from "../components/chat/UserMenu";
import { WorkspaceSwitcher } from "../components/layout/WorkspaceSwitcher";
import { LocationMap } from "../components/map/LocationMap";
import { LocationSummaryCard } from "../components/map/LocationSummaryCard";
import { Button } from "../components/ui/Button";
import { authStore } from "../store/authStore";
import { chatStore } from "../store/chatStore";
import { locationStore } from "../store/locationStore";
import { realtimeStore } from "../store/realtimeStore";
import { mapLocationErrorMessage } from "../utils/location";

function requestBrowserLocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Browser geolocation is not available."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function MapPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    isAuthenticated,
    error: authError,
    clearError,
    logout,
    updateDisplayName,
  } = authStore();
  const {
    myLocation,
    contactLocations,
    isLoading,
    isSharing,
    isStopping,
    error,
    notice,
    loadLocations,
    shareLocation,
    stopSharing,
    clearNotice,
  } = locationStore();
  const loadChats = chatStore((state) => state.loadChats);
  const selectChat = chatStore((state) => state.selectChat);
  const connectionState = realtimeStore((state) => state.connectionState);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      navigate("/", { replace: true });
      return;
    }

    void loadLocations();
  }, [currentUser, isAuthenticated, loadLocations, navigate]);

  useEffect(() => {
    if (authError) {
      navigate("/", { replace: true });
      clearError();
    }
  }, [authError, clearError, navigate]);

  const center = useMemo<[number, number]>(() => {
    if (
      myLocation?.sharingEnabled &&
      myLocation.latitude != null &&
      myLocation.longitude != null
    ) {
      return [myLocation.latitude, myLocation.longitude];
    }
    if (contactLocations[0]) {
      return [contactLocations[0].latitude, contactLocations[0].longitude];
    }
    return [53.9, 27.56];
  }, [contactLocations, myLocation]);

  if (!currentUser) {
    return null;
  }

  async function handleShareLocation() {
    clearNotice();
    try {
      const position = await requestBrowserLocation();
      await shareLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
      });
    } catch (shareError) {
      locationStore.setState({
        error: mapLocationErrorMessage(
          shareError,
          "Could not access the browser location.",
        ),
      });
    }
  }

  async function handleOpenChat(contact: ContactLocation) {
    try {
      const chat = await chatApi.createChat(contact.displayName, [contact.phone]);
      await loadChats();
      selectChat(chat.id);
      navigate("/messenger");
    } catch (openChatError) {
      locationStore.setState({
        error: mapLocationErrorMessage(
          openChatError,
          "Could not open the direct chat from the map.",
        ),
      });
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),_transparent_26%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid max-w-[1440px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-[32px] border border-white/10 bg-slate-950/40 p-4 backdrop-blur-2xl">
          <div className="space-y-4">
            <WorkspaceSwitcher />
            <UserMenu
              user={currentUser}
              connectionState={connectionState}
              onUpdateDisplayName={updateDisplayName}
              onLogout={logout}
            />
            <LocationSummaryCard
              myLocation={myLocation}
              contacts={contactLocations}
            />
            <div className="space-y-3 rounded-[28px] border border-white/10 bg-white/6 p-4">
              <p className="text-sm font-semibold text-white">Location</p>
              <Button
                block
                disabled={isSharing}
                onClick={() => void handleShareLocation()}
              >
                {isSharing
                  ? "Sharing..."
                  : myLocation?.sharingEnabled
                    ? "Update my location"
                    : "Share my location"}
              </Button>
              <Button
                block
                variant="secondary"
                disabled={!myLocation?.sharingEnabled || isStopping}
                onClick={() => void stopSharing()}
              >
                {isStopping ? "Stopping..." : "Stop sharing"}
              </Button>
              <Button
                block
                variant="ghost"
                disabled={isLoading}
                onClick={() => void loadLocations()}
              >
                Refresh map
              </Button>
              {notice ? (
                <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <div className="rounded-[32px] border border-white/10 bg-slate-950/40 p-4 backdrop-blur-2xl">
            {contactLocations.length === 0 && !myLocation?.sharingEnabled ? (
              <div className="flex h-[560px] items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/4 px-6 text-center text-sm text-slate-400">
                Location not shared. Only contacts who explicitly enabled
                sharing appear here.
              </div>
            ) : (
              <LocationMap
                center={center}
                myLocation={myLocation}
                contacts={contactLocations}
                onOpenChat={(contact) => void handleOpenChat(contact)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
