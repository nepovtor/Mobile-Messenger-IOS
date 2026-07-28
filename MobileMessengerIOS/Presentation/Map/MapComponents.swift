import SwiftUI

struct MapPrivacyCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Приватность", systemImage: "lock.shield.fill")
                .font(.headline)
                .foregroundStyle(AppTheme.primary)

            Text("Геолокация доступна только вашим контактам, пока передача включена.")
                .font(.subheadline)
                .foregroundStyle(.primary)

            Text("Фоновое отслеживание выключено. Сохраняется только последняя точка.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .liquidGlassCard(
            cornerRadius: 22,
            tint: AppTheme.primary,
            secondaryTint: AppTheme.aqua,
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
                                ? [AppTheme.mint.opacity(0.92), AppTheme.primary.opacity(0.78)]
                                : [AppTheme.primary.opacity(0.92), AppTheme.aqua.opacity(0.78)],
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
                Text("Неактуально")
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
                    Text("Геолокация устарела")
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
                Label("Точность ~\(Int(accuracy)) м", systemImage: "scope")
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
                        Text(isOpeningChat ? "Открываем…" : "Открыть чат")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(
                    LiquidGlassProminentButtonStyle(
                        tint: AppTheme.primary,
                        secondaryTint: AppTheme.aqua
                    )
                )
                .disabled(isOpeningChat)
            }
        }
        .padding(18)
        .liquidGlassCard(
            cornerRadius: 24,
            tint: AppTheme.coral,
            secondaryTint: AppTheme.aqua,
            innerDarkness: 0.18
        )
    }
}
