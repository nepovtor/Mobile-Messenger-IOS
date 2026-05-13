import SwiftUI
import MapKit

struct MapView: View {
    @EnvironmentObject private var sessionStore: SessionStore
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
                            tint: .green
                        )
                    } else if let errorMessage = viewModel.errorMessage {
                        BannerMessageView(
                            message: errorMessage,
                            systemImage: "location.slash.fill",
                            tint: .red
                        )
                    }
                }
                .padding()
            }
            .task {
                viewModel.handleSessionChange(sessionStore.state)
                viewModel.onAppear()
            }
            .onChange(of: sessionStore.state) { _, newState in
                permissionManager.stopTracking()
                viewModel.handleSessionChange(newState)
                viewModel.onAppear()
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
                        Text(viewModel.myLocationShare.sharingEnabled ? "Update my location" : "Share my location")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(
                    LiquidGlassProminentButtonStyle(
                        tint: Color(red: 0.30, green: 0.47, blue: 1.00),
                        secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97)
                    )
                )
                .disabled(viewModel.isSharing)

                Button("Stop sharing") {
                    Task {
                        await viewModel.stopSharing(using: permissionManager)
                    }
                }
                .buttonStyle(
                    LiquidGlassSecondaryButtonStyle(
                        tint: .white,
                        secondaryTint: Color(red: 0.93, green: 0.35, blue: 0.76)
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
                        "Location not shared",
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
                accent: Color(red: 0.30, green: 0.47, blue: 1.00),
                secondaryAccent: Color(red: 0.07, green: 0.82, blue: 0.97),
                tertiaryAccent: Color(red: 0.49, green: 0.92, blue: 0.61)
            )
        )
    }

    private func syncMapPosition() {
        mapPosition = .region(viewModel.region)
    }

    static func formattedTimestamp(_ value: String) -> String {
        guard let date = ISO8601DateFormatter.flexible.date(from: value) else {
            return "Updated recently"
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
