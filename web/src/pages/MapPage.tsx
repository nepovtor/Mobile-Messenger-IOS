import { Compass, RefreshCcw } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { chatApi } from "../api/chatApi";
import type { ContactLocation } from "../api/locationApi";
import { UserMenu } from "../components/chat/UserMenu";
import { WorkspaceSwitcher } from "../components/layout/WorkspaceSwitcher";
import { LocationMap } from "../components/map/LocationMap";
import { LocationSummaryCard } from "../components/map/LocationSummaryCard";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Skeleton } from "../components/ui/Skeleton";
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
      const chat = await chatApi.createChat(contact.displayName, [
        contact.phone,
      ]);
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
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),_transparent_26%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 py-4 sm:px-6 sm:py-6">
      <div className="glass-orb left-[-4rem] top-[5rem] h-44 w-44 bg-cyan-400/22" />
      <div className="glass-orb right-[10%] top-[10%] h-60 w-60 bg-emerald-400/16" />

      <div className="mx-auto flex max-w-[1480px] flex-col gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                <Compass className="h-3.5 w-3.5" />
                Shared locations
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Privacy-first map experience
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Share or update your current position when needed, stop sharing
                instantly, and open a direct chat from any visible contact pin.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Sharing
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {myLocation?.sharingEnabled ? "Enabled" : "Off"}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Contacts
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {contactLocations.length} visible
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Realtime
                </p>
                <p className="mt-2 text-sm font-semibold capitalize text-white">
                  {connectionState}
                </p>
              </Card>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
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
              <div className="space-y-3 rounded-[28px] border border-white/10 bg-white/[0.06] p-4">
                <p className="text-sm font-semibold text-white">
                  Location controls
                </p>
                <Button
                  block
                  isLoading={isSharing}
                  disabled={isSharing}
                  onClick={() => void handleShareLocation()}
                >
                  {myLocation?.sharingEnabled
                    ? "Update location"
                    : "Share location"}
                </Button>
                <Button
                  block
                  variant="secondary"
                  disabled={!myLocation?.sharingEnabled || isStopping}
                  isLoading={isStopping}
                  onClick={() => void stopSharing()}
                >
                  Stop sharing
                </Button>
                <Button
                  block
                  variant="ghost"
                  disabled={isLoading}
                  onClick={() => void loadLocations()}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh map
                </Button>
                {notice ? (
                  <InlineAlert tone="success" title="Location">
                    {notice}
                  </InlineAlert>
                ) : null}
                {error ? (
                  <InlineAlert tone="danger" title="Location">
                    {error}
                  </InlineAlert>
                ) : null}
              </div>
            </div>
          </aside>

          <main className="space-y-4">
            <Card className="p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Shared location map
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Only users who share their latest point appear here.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={isLoading}
                  onClick={() => void loadLocations()}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-[560px] rounded-[28px]" />
                </div>
              ) : contactLocations.length === 0 &&
                !myLocation?.sharingEnabled ? (
                <div className="flex h-[560px] items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.04] px-6 text-center text-sm text-slate-400">
                  Location not shared yet. Sharing stays off by default until
                  you explicitly publish or update your current point.
                </div>
              ) : (
                <LocationMap
                  center={center}
                  myLocation={myLocation}
                  contacts={contactLocations}
                  onOpenChat={(contact) => void handleOpenChat(contact)}
                />
              )}
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
