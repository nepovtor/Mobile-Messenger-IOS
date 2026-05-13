import SwiftUI

struct ContactRow: View, Equatable {
    let contact: Contact
    let isOpening: Bool

    static func == (lhs: ContactRow, rhs: ContactRow) -> Bool {
        lhs.contact == rhs.contact && lhs.isOpening == rhs.isOpening
    }

    var body: some View {
        HStack(spacing: 14) {
            avatar

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(contact.displayName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    if contact.directChatID != nil {
                        Label("Direct", systemImage: "bolt.horizontal.circle.fill")
                            .font(.caption2.weight(.semibold))
                            .labelStyle(.titleAndIcon)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(directBadgeBackground, in: Capsule())
                    }
                }

                Text(contact.phone)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Text(contact.directChatID == nil ? "Чат будет открыт автоматически" : "Нажмите, чтобы открыть direct chat")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if isOpening {
                ProgressView()
            } else {
                Image(systemName: "message.fill")
                    .foregroundStyle(AppTheme.primary)
            }
        }
        .padding(16)
        .background(rowBackground, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(rowBorder, lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var avatar: some View {
        Circle()
            .fill(avatarBackground)
            .frame(width: 50, height: 50)
            .overlay {
                Text(initials)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
            }
    }

    private var rowBackground: LinearGradient {
        LinearGradient(
            colors: [
                Color(uiColor: .systemBackground).opacity(0.86),
                AppTheme.lightSurfaceTint.opacity(0.56)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var rowBorder: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(0.62),
                AppTheme.aqua.opacity(0.20)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var avatarBackground: LinearGradient {
        LinearGradient(
            colors: [
                AppTheme.primary,
                AppTheme.aqua
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var directBadgeBackground: LinearGradient {
        LinearGradient(
            colors: [
                AppTheme.primary,
                AppTheme.aqua
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var initials: String {
        ProfileViewModel.makeInitials(from: contact.displayName)
    }
}

struct ContactRowSkeleton: View {
    var body: some View {
        HStack(spacing: 14) {
            SkeletonView(isActive: true)
                .frame(width: 50, height: 50)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(height: 16)
                SkeletonView(isActive: true)
                    .frame(height: 12)
            }
        }
        .padding(.vertical, 8)
    }
}

struct BannerMessageView: View {
    let message: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
            Text(message)
                .font(.footnote.weight(.medium))
            Spacer()
        }
        .padding()
        .foregroundStyle(tint)
        .liquidGlassCard(
            cornerRadius: 16,
            tint: tint,
            secondaryTint: .white,
            innerDarkness: 0.12
        )
    }
}
