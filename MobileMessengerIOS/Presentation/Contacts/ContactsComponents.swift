import SwiftUI

struct ContactRow: View {
    let contact: Contact
    let isOpening: Bool

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color.blue.opacity(0.85), Color.cyan.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 50, height: 50)
                .overlay {
                    Text(initials)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(contact.displayName)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    if contact.directChatID != nil {
                        Label("Direct", systemImage: "bolt.horizontal.circle.fill")
                            .font(.caption2.weight(.semibold))
                            .labelStyle(.titleAndIcon)
                            .foregroundStyle(.blue)
                    }
                }

                Text(contact.phone)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text(contact.directChatID == nil ? "Чат будет открыт автоматически" : "Нажмите, чтобы открыть direct chat")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if isOpening {
                ProgressView()
            } else {
                Image(systemName: "message.fill")
                    .foregroundStyle(.blue)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.35), lineWidth: 1)
        }
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
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
