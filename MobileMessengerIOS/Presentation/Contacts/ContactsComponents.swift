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

            VStack(alignment: .leading, spacing: 5) {
                Text(contact.displayName)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(contact.phone)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if isOpening {
                ProgressView()
            } else {
                Image(systemName: "message.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.primary)
                    .frame(width: 38, height: 38)
                    .background(AppTheme.primary.opacity(0.11), in: Circle())
            }
        }
        .padding(14)
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
                Color(uiColor: .secondarySystemGroupedBackground),
                Color(uiColor: .secondarySystemGroupedBackground)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var rowBorder: LinearGradient {
        LinearGradient(
            colors: [
                Color(uiColor: .separator).opacity(0.16),
                Color(uiColor: .separator).opacity(0.08)
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
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
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
