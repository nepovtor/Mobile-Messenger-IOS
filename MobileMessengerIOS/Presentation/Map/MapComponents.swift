import SwiftUI

struct MapPrivacyCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Privacy", systemImage: "lock.shield.fill")
                .font(.headline)
                .foregroundStyle(Color(red: 0.30, green: 0.47, blue: 1.00))

            Text("Your location is shared only with your contacts while sharing is enabled.")
                .font(.subheadline)
                .foregroundStyle(.primary)

            Text("Background tracking is off by default. Only the latest point is stored.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .liquidGlassCard(
            cornerRadius: 22,
            tint: Color(red: 0.30, green: 0.47, blue: 1.00),
            secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
            innerDarkness: 0.18
        )
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
                .buttonStyle(
                    LiquidGlassProminentButtonStyle(
                        tint: Color(red: 0.30, green: 0.47, blue: 1.00),
                        secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97)
                    )
                )
                .disabled(isOpeningChat)
            }
        }
        .padding(18)
        .liquidGlassCard(
            cornerRadius: 24,
            tint: Color(red: 0.93, green: 0.35, blue: 0.76),
            secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
            innerDarkness: 0.18
        )
    }
}
