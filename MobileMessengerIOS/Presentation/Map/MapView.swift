import SwiftUI
import MapKit

struct MapView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var viewModel: MapViewModel
    @StateObject private var permissionManager = LocationPermissionManager()
    @State private var openedChat: ChatListItem?

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeMapViewModel())
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
                .buttonStyle(LiquidGlassPrimaryButtonStyle())
                .disabled(viewModel.isSharing)

                Button("Stop sharing") {
                    Task {
                        await viewModel.stopSharing(using: permissionManager)
                    }
                }
                .buttonStyle(LiquidGlassSecondaryButtonStyle())
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
                Map(
                    coordinateRegion: $viewModel.region,
                    annotationItems: viewModel.markers
                ) { marker in
                    MapAnnotation(coordinate: marker.coordinate) {
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
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.28), lineWidth: 1)
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
            LinearGradient(
                colors: [Color.blue.opacity(0.14), Color.cyan.opacity(0.08), Color(uiColor: .systemBackground)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
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
