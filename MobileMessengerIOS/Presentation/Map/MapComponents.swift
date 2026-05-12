import SwiftUI

struct MapPrivacyCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Privacy", systemImage: "lock.shield.fill")
                .font(.headline)
                .foregroundStyle(.blue)

            Text("Your location is shared only with your contacts while sharing is enabled.")
                .font(.subheadline)
                .foregroundStyle(.primary)

            Text("Background tracking is off by default. Only the latest point is stored.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.35), lineWidth: 1)
        }
    }
}

struct MapMarkerBadge: View {
    let title: String
    let isCurrentUser: Bool
    let isOutdated: Bool

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: isCurrentUser
                                ? [Color.green.opacity(0.92), Color.blue.opacity(0.78)]
                                : [Color.blue.opacity(0.92), Color.cyan.opacity(0.78)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)

                Text(ProfileViewModel.makeInitials(from: title))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
            }

            if isOutdated {
                Text("Outdated")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.orange.opacity(0.18)))
                    .foregroundStyle(.orange)
            }
        }
    }
}

struct MapLocationDetailCard: View {
    let marker: MapMarkerItem
    let isOpeningChat: Bool
    let onOpenChat: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(marker.title)
                        .font(.headline)
                    Text(marker.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if marker.isOutdated {
                    Text("Location outdated")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }

            if let updatedAt = marker.updatedAt {
                Label(MapView.formattedTimestamp(updatedAt), systemImage: "clock")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let accuracy = marker.accuracy {
                Label("Accuracy ~\(Int(accuracy)) m", systemImage: "scope")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if !marker.isCurrentUser {
                Button(action: onOpenChat) {
                    HStack {
                        if isOpeningChat {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(isOpeningChat ? "Opening..." : "Open chat")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(LiquidGlassPrimaryButtonStyle())
                .disabled(isOpeningChat)
            }
        }
        .padding(18)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.25), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.12), radius: 14, y: 8)
    }
}
