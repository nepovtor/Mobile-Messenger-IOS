import SwiftUI

struct ContactRow: View {
    let contact: Contact
    let isOpening: Bool

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .frame(width: 50, height: 50)
                .overlay {
                    Text(initials)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                }
                .liquidGlassCircle(
                    tint: Color(red: 0.30, green: 0.47, blue: 1.00),
                    secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
                    innerDarkness: 0.42
                )

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(contact.displayName)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    if contact.directChatID != nil {
                        Label("Direct", systemImage: "bolt.horizontal.circle.fill")
                            .font(.caption2.weight(.semibold))
                            .labelStyle(.titleAndIcon)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .liquidGlassCapsule(
                                tint: Color(red: 0.30, green: 0.47, blue: 1.00),
                                secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
                                innerDarkness: 0.40
                            )
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
        .liquidGlassCard(
            cornerRadius: 22,
            tint: Color(red: 0.30, green: 0.47, blue: 1.00),
            secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
            innerDarkness: 0.16
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
