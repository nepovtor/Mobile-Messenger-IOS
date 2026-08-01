import SwiftUI
import MapKit

struct MapView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var viewModel: MapViewModel
    @StateObject private var permissionManager = LocationPermissionManager()
    @State private var mapPosition: MapCameraPosition
    @State private var openedChat: ChatListItem?

    private static let defaultRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 53.9, longitude: 27.56),
        span: MKCoordinateSpan(latitudeDelta: 0.2, longitudeDelta: 0.2)
    )

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeMapViewModel())
        _mapPosition = State(initialValue: .region(Self.defaultRegion))
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                mapContent

                if let marker = viewModel.selectedMarker {
                    MapLocationDetailCard(
                        marker: marker,
                        isOpeningChat: viewModel.openingChatPhone == marker.phone
                    ) {
                        Task {
                            if let chat = await viewModel.openChat(for: marker) {
                                openedChat = chat
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
            }
            .navigationTitle("Карта")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $openedChat) { chat in
                DialogueView(chat: chat)
            }
            .overlay(alignment: .top) {
                VStack(spacing: 10) {
                    if let infoMessage = viewModel.infoMessage {
                        BannerMessageView(
                            message: infoMessage,
                            systemImage: "location.circle.fill",
                            tint: AppTheme.mint
                        )
                    } else if let errorMessage = viewModel.errorMessage {
                        BannerMessageView(
                            message: errorMessage,
                            systemImage: "location.slash.fill",
                            tint: AppTheme.coral
                        )
                    }
                }
                .padding()
            }
            .task {
                viewModel.handleSessionChange(sessionStore.state)
                viewModel.onAppear(
                    using: permissionManager,
                    isApplicationActive: scenePhase == .active
                )
            }
            .onChange(of: sessionStore.state) { _, newState in
                permissionManager.stopTracking()
                viewModel.handleSessionChange(newState)
                viewModel.onAppear(
                    using: permissionManager,
                    isApplicationActive: scenePhase == .active
                )
            }
            .onChange(of: scenePhase) { _, newPhase in
                viewModel.setApplicationActive(newPhase == .active, using: permissionManager)
            }
        }
    }

    private var mapContent: some View {
        VStack(spacing: 14) {
            MapPrivacyCard()
                .padding(.horizontal, 16)
                .padding(.top, 10)

            HStack(spacing: 12) {
                Button {
                    Task {
                        await viewModel.shareMyLocation(using: permissionManager)
                    }
                } label: {
                    HStack {
                        if viewModel.isSharing {
                            ProgressView()
                                .tint(.white)
                        }
                        Label(
                            viewModel.myLocationShare.sharingEnabled ? "Обновить" : "Поделиться",
                            systemImage: "location.fill"
                        )
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(
                    LiquidGlassProminentButtonStyle(
                        tint: AppTheme.primary,
                        secondaryTint: AppTheme.aqua
                    )
                )
                .disabled(viewModel.isSharing)

                Button("Остановить") {
                    Task {
                        await viewModel.stopSharing(using: permissionManager)
                    }
                }
                .buttonStyle(
                    LiquidGlassSecondaryButtonStyle(
                        tint: .white,
                        secondaryTint: AppTheme.coral
                    )
                )
                .disabled(!viewModel.myLocationShare.sharingEnabled || viewModel.isStoppingShare)
            }
            .padding(.horizontal, 16)

            if let authorizationMessage = permissionManager.authorizationMessage() {
                Text(authorizationMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
            }

            HStack(spacing: 8) {
                Image(systemName: trackingStatusSymbol)
                    .foregroundStyle(trackingStatusTint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(viewModel.trackingStatus.title)
                        .font(.footnote.weight(.semibold))
                    if let updatedAt = viewModel.lastLocationUpdateAt {
                        Text(updatedAt, style: .relative)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 16)

            ZStack {
                Map(position: $mapPosition) {
                    ForEach(viewModel.markers) { marker in
                        Annotation(marker.title, coordinate: marker.coordinate) {
                            if marker.isCurrentUser {
                                MapMarkerBadge(
                                    title: marker.title,
                                    isCurrentUser: true,
                                    isOutdated: marker.isOutdated
                                )
                            } else {
                                Button {
                                    viewModel.selectedMarker = marker
                                } label: {
                                    MapMarkerBadge(
                                        title: marker.title,
                                        isCurrentUser: false,
                                        isOutdated: marker.isOutdated
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.28), lineWidth: 1)
                }
                .onAppear {
                    syncMapPosition()
                }
                .onChange(of: MapRegionKey(viewModel.region)) {
                    syncMapPosition()
                }

                if viewModel.contactLocations.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView(
                        "Геолокация не передаётся",
                        systemImage: "mappin.slash",
                        description: Text(viewModel.emptyStateMessage)
                    )
                }
            }
            .padding(.horizontal, 16)
            .frame(maxHeight: .infinity)
        }
        .background(
            LiquidGlassBackground(
                accent: AppTheme.primary,
                secondaryAccent: AppTheme.aqua,
                tertiaryAccent: AppTheme.mint
            )
        )
    }

    private func syncMapPosition() {
        mapPosition = .region(viewModel.region)
    }

    private var trackingStatusSymbol: String {
        switch viewModel.trackingStatus {
        case .active:
            return "location.fill"
        case .starting:
            return "location.circle"
        case .paused:
            return "pause.circle"
        case .authorizationDenied, .noActivePermission, .unavailable:
            return "location.slash"
        case .off:
            return "location"
        }
    }

    private var trackingStatusTint: Color {
        switch viewModel.trackingStatus {
        case .active:
            return AppTheme.mint
        case .starting:
            return AppTheme.primary
        case .authorizationDenied, .noActivePermission, .unavailable:
            return AppTheme.coral
        case .off, .paused:
            return .secondary
        }
    }

    static func formattedTimestamp(_ value: String) -> String {
        guard let date = ISO8601DateFormatter.flexible.date(from: value) else {
            return "Обновлено недавно"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

private struct MapRegionKey: Equatable {
    let latitude: CLLocationDegrees
    let longitude: CLLocationDegrees
    let latitudeDelta: CLLocationDegrees
    let longitudeDelta: CLLocationDegrees

    init(_ region: MKCoordinateRegion) {
        latitude = region.center.latitude
        longitude = region.center.longitude
        latitudeDelta = region.span.latitudeDelta
        longitudeDelta = region.span.longitudeDelta
    }
}
