import SwiftUI

enum LiquidGlassDesign {
    static let glassBackground = Color(red: 0.015, green: 0.025, blue: 0.055).opacity(0.82)
    static let glassSecondaryBackground = Color.white.opacity(0.14)
    static let glassStroke = Color.white.opacity(0.32)
    static let glassHighlight = Color.white.opacity(0.58)
    static let liquidBlue = Color(red: 0.12, green: 0.46, blue: 1.0)
    static let liquidPurple = Color(red: 0.70, green: 0.22, blue: 1.0)
    static let liquidCyan = Color(red: 0.10, green: 0.86, blue: 1.0)

    static let primaryGlowShadow = Color(red: 0.20, green: 0.42, blue: 1.0).opacity(0.42)
    static let secondaryGlowShadow = Color(red: 0.42, green: 0.86, blue: 1.0).opacity(0.24)
    static let purpleGlowShadow = Color(red: 0.80, green: 0.22, blue: 1.0).opacity(0.26)
    static let deepShadow = Color.black.opacity(0.42)

    static let capsuleCornerRadius: CGFloat = 28
    static let roundedCornerRadius: CGFloat = 22
    static let horizontalPadding: CGFloat = 22
    static let verticalPadding: CGFloat = 15
    static let minimumHeight: CGFloat = 54
    static let iconSize: CGFloat = 44
}

struct LiquidGlassPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold, design: .rounded))
            .foregroundStyle(.white.opacity(isEnabled ? 1 : 0.58))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, LiquidGlassDesign.horizontalPadding)
            .padding(.vertical, LiquidGlassDesign.verticalPadding)
            .frame(minHeight: LiquidGlassDesign.minimumHeight)
            .contentShape(Capsule())
            .background {
                LiquidGlassCapsuleSurface(
                    isPressed: configuration.isPressed,
                    isEnabled: isEnabled,
                    variant: .primary
                )
            }
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .opacity(isEnabled ? 1 : 0.62)
            .animation(.spring(response: 0.26, dampingFraction: 0.74), value: configuration.isPressed)
            .animation(.easeInOut(duration: 0.18), value: isEnabled)
    }
}

struct LiquidGlassSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(isEnabled ? 0.94 : 0.55))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(minHeight: 48)
            .contentShape(Capsule())
            .background {
                LiquidGlassCapsuleSurface(
                    isPressed: configuration.isPressed,
                    isEnabled: isEnabled,
                    variant: .secondary
                )
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(isEnabled ? 1 : 0.64)
            .animation(.spring(response: 0.26, dampingFraction: 0.76), value: configuration.isPressed)
            .animation(.easeInOut(duration: 0.18), value: isEnabled)
    }
}

struct LiquidGlassIconButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold, design: .rounded))
            .foregroundStyle(.white.opacity(isEnabled ? 1 : 0.54))
            .frame(minWidth: LiquidGlassDesign.iconSize, minHeight: LiquidGlassDesign.iconSize)
            .contentShape(Capsule())
            .background {
                LiquidGlassCapsuleSurface(
                    isPressed: configuration.isPressed,
                    isEnabled: isEnabled,
                    variant: .icon
                )
            }
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .opacity(isEnabled ? 1 : 0.58)
            .animation(.spring(response: 0.24, dampingFraction: 0.72), value: configuration.isPressed)
            .animation(.easeInOut(duration: 0.18), value: isEnabled)
    }
}

struct LiquidGlassButton<Label: View>: View {
    enum Variant {
        case primary
        case secondary
    }

    let variant: Variant
    let action: () -> Void
    @ViewBuilder let label: () -> Label

    init(
        variant: Variant = .primary,
        action: @escaping () -> Void,
        @ViewBuilder label: @escaping () -> Label
    ) {
        self.variant = variant
        self.action = action
        self.label = label
    }

    var body: some View {
        switch variant {
        case .primary:
            Button(action: action) {
                label()
            }
            .buttonStyle(LiquidGlassPrimaryButtonStyle())
        case .secondary:
            Button(action: action) {
                label()
            }
            .buttonStyle(LiquidGlassSecondaryButtonStyle())
        }
    }
}

enum AnyLiquidGlassButtonStyle {
    static var primary: LiquidGlassAnyButtonStyle {
        LiquidGlassAnyButtonStyle(LiquidGlassPrimaryButtonStyle())
    }

    static var secondary: LiquidGlassAnyButtonStyle {
        LiquidGlassAnyButtonStyle(LiquidGlassSecondaryButtonStyle())
    }
}

struct LiquidGlassAnyButtonStyle: ButtonStyle {
    private let makeBody: (Configuration) -> AnyView

    init<S: ButtonStyle>(_ style: S) {
        makeBody = { configuration in AnyView(style.makeBody(configuration: configuration)) }
    }

    func makeBody(configuration: Configuration) -> some View {
        makeBody(configuration)
    }
}

private struct LiquidGlassCapsuleSurface: View {
    enum Variant {
        case primary
        case secondary
        case icon
    }

    let isPressed: Bool
    let isEnabled: Bool
    let variant: Variant

    var body: some View {
        Capsule()
            .fill(baseGradient)
            .overlay(edgeGlow)
            .overlay(topHighlight)
            .overlay(bottomRefraction)
            .overlay(strokeLayer)
            .shadow(color: LiquidGlassDesign.deepShadow.opacity(shadowOpacity), radius: shadowRadius, x: 0, y: shadowY)
            .shadow(color: glowColor.opacity(glowOpacity), radius: glowRadius, x: 0, y: 0)
            .shadow(color: LiquidGlassDesign.purpleGlowShadow.opacity(isPressed ? 0.45 : 1), radius: glowRadius * 0.72, x: 0, y: 6)
    }

    private var baseGradient: LinearGradient {
        switch variant {
        case .primary:
            return LinearGradient(
                colors: [
                    Color.white.opacity(0.22),
                    LiquidGlassDesign.glassBackground,
                    Color(red: 0.006, green: 0.009, blue: 0.02).opacity(0.94)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .secondary:
            return LinearGradient(
                colors: [
                    Color.white.opacity(0.30),
                    LiquidGlassDesign.glassSecondaryBackground,
                    Color(red: 0.025, green: 0.028, blue: 0.055).opacity(0.76)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .icon:
            return LinearGradient(
                colors: [
                    Color.white.opacity(0.24),
                    Color(red: 0.016, green: 0.026, blue: 0.06).opacity(0.86),
                    Color.black.opacity(0.86)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var edgeGlow: some View {
        Capsule()
            .fill(
                LinearGradient(
                    colors: [
                        LiquidGlassDesign.liquidCyan.opacity(edgeOpacity),
                        Color.clear,
                        LiquidGlassDesign.liquidBlue.opacity(edgeOpacity * 0.82),
                        LiquidGlassDesign.liquidPurple.opacity(edgeOpacity)
                    ],
                    startPoint: .bottomLeading,
                    endPoint: .topTrailing
                )
            )
            .blur(radius: 8)
            .padding(1)
            .mask(Capsule().stroke(lineWidth: variant == .icon ? 8 : 10))
    }

    private var topHighlight: some View {
        Capsule()
            .fill(
                LinearGradient(
                    colors: [
                        LiquidGlassDesign.glassHighlight.opacity(isPressed ? 0.28 : 0.50),
                        Color.white.opacity(0.08),
                        Color.clear
                    ],
                    startPoint: .topLeading,
                    endPoint: .center
                )
            )
            .scaleEffect(x: 0.92, y: 0.34, anchor: .top)
            .offset(y: 5)
            .blendMode(.screen)
    }

    private var bottomRefraction: some View {
        Capsule()
            .stroke(
                LinearGradient(
                    colors: [
                        Color.clear,
                        LiquidGlassDesign.liquidCyan.opacity(variant == .secondary ? 0.28 : 0.42),
                        LiquidGlassDesign.liquidPurple.opacity(variant == .secondary ? 0.20 : 0.36)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                lineWidth: variant == .icon ? 2 : 3
            )
            .blur(radius: 1.6)
            .offset(y: variant == .icon ? 8 : 11)
            .mask(Capsule())
    }

    private var strokeLayer: some View {
        Capsule()
            .strokeBorder(
                LinearGradient(
                    colors: [
                        Color.white.opacity(isPressed ? 0.24 : 0.52),
                        LiquidGlassDesign.glassStroke.opacity(0.6),
                        LiquidGlassDesign.liquidBlue.opacity(variant == .secondary ? 0.28 : 0.58),
                        Color.white.opacity(0.18)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: 1.25
            )
    }

    private var glowColor: Color {
        switch variant {
        case .primary: return LiquidGlassDesign.primaryGlowShadow
        case .secondary: return LiquidGlassDesign.secondaryGlowShadow
        case .icon: return LiquidGlassDesign.liquidCyan.opacity(0.34)
        }
    }

    private var edgeOpacity: Double {
        guard isEnabled else { return 0.10 }
        return isPressed ? 0.30 : (variant == .secondary ? 0.30 : 0.52)
    }

    private var glowOpacity: Double {
        guard isEnabled else { return 0.22 }
        return isPressed ? 0.46 : (variant == .secondary ? 0.52 : 0.92)
    }

    private var shadowOpacity: Double {
        isEnabled ? (isPressed ? 0.26 : 1) : 0.45
    }

    private var shadowRadius: CGFloat {
        isPressed ? 10 : (variant == .icon ? 16 : 22)
    }

    private var shadowY: CGFloat {
        isPressed ? 6 : (variant == .icon ? 10 : 16)
    }

    private var glowRadius: CGFloat {
        isPressed ? 10 : (variant == .secondary ? 14 : 22)
    }
}
