import SwiftUI

struct ProfileSectionCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer

    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            VStack(spacing: 0) {
                content
            }
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(cardBackgroundColor)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(cardBorderColor, lineWidth: 1)
            }
        }
    }

    private var cardBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color(uiColor: .tertiarySystemBackground)
        }
        return Color(uiColor: .secondarySystemGroupedBackground)
    }

    private var cardBorderColor: Color {
        if isHighContrastDarkActive {
            return Color.white.opacity(0.16)
        }
        return Color.primary.opacity(0.06)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

struct ProfileInfoRow: View {
    let systemImage: String
    let title: String
    let value: String

    var detail: String?
    var tint: Color = .blue
    var monospaced = false

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint.opacity(0.14))
                .frame(width: 40, height: 40)
                .overlay {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(tint)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Group {
                    if monospaced {
                        Text(value)
                            .font(.system(.footnote, design: .monospaced))
                    } else {
                        Text(value)
                            .font(.body.weight(.semibold))
                    }
                }
                .foregroundStyle(.primary)
                .lineLimit(monospaced ? 3 : 2)
                .multilineTextAlignment(.leading)

                if let detail {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
    }
}

struct ProfileStatusBadge: View {
    enum Tone {
        case neutral
        case success
        case warning
        case danger

        var tint: Color {
            switch self {
            case .neutral:
                return .blue
            case .success:
                return .green
            case .warning:
                return .orange
            case .danger:
                return .red
            }
        }
    }

    let title: String
    let tone: Tone

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(tone.tint)
                .frame(width: 8, height: 8)

            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tone.tint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(tone.tint.opacity(0.12), in: Capsule())
    }
}
