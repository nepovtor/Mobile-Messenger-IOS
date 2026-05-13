import SwiftUI
import UIKit

enum AppTheme {
    static let primary = Color(red: 0.12, green: 0.42, blue: 0.94)
    static let aqua = Color(red: 0.02, green: 0.70, blue: 0.82)
    static let mint = Color(red: 0.32, green: 0.78, blue: 0.58)
    static let coral = Color(red: 0.94, green: 0.38, blue: 0.48)
    static let amber = Color(red: 0.94, green: 0.61, blue: 0.24)

    static let lightTop = Color(red: 0.98, green: 0.99, blue: 0.98)
    static let lightMiddle = Color(red: 0.93, green: 0.98, blue: 1.00)
    static let lightBottom = Color(red: 0.98, green: 0.96, blue: 1.00)
    static let lightSurface = Color(red: 0.98, green: 0.99, blue: 0.98)
    static let lightSurfaceTint = Color(red: 0.87, green: 0.96, blue: 0.98)

    static let primaryUIColor = UIColor(red: 0.12, green: 0.42, blue: 0.94, alpha: 1)
    static let aquaUIColor = UIColor(red: 0.02, green: 0.70, blue: 0.82, alpha: 1)
    static let lightChromeUIColor = UIColor(red: 0.96, green: 0.99, blue: 0.98, alpha: 0.94)
    static let lightShadowUIColor = UIColor(red: 0.09, green: 0.33, blue: 0.55, alpha: 0.12)
}

struct LiquidGlassBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var accent: Color = AppTheme.primary
    var secondaryAccent: Color = AppTheme.aqua
    var tertiaryAccent: Color = AppTheme.coral

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size

            ZStack {
                LinearGradient(
                    colors: [topColor, middleColor, bottomColor],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                accent.opacity(colorScheme == .dark ? 0.20 : 0.16),
                                accent.opacity(0)
                            ],
                            center: .center,
                            startRadius: 8,
                            endRadius: size.width * 0.44
                        )
                    )
                    .frame(width: size.width * 0.82, height: size.width * 0.82)
                    .offset(x: size.width * 0.34, y: -size.height * 0.22)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                secondaryAccent.opacity(colorScheme == .dark ? 0.16 : 0.14),
                                secondaryAccent.opacity(0)
                            ],
                            center: .center,
                            startRadius: 8,
                            endRadius: size.width * 0.40
                        )
                    )
                    .frame(width: size.width * 0.74, height: size.width * 0.74)
                    .offset(x: -size.width * 0.38, y: size.height * 0.18)

                RoundedRectangle(cornerRadius: 88, style: .continuous)
                    .fill(
                        RadialGradient(
                            colors: [
                                tertiaryAccent.opacity(colorScheme == .dark ? 0.13 : 0.10),
                                tertiaryAccent.opacity(0)
                            ],
                            center: .center,
                            startRadius: 12,
                            endRadius: size.width * 0.34
                        )
                    )
                    .frame(width: size.width * 0.58, height: size.width * 0.58)
                    .rotationEffect(.degrees(18))
                    .offset(x: size.width * 0.30, y: size.height * 0.32)

                Capsule()
                    .fill(Color.white.opacity(colorScheme == .dark ? 0.06 : 0.22))
                    .frame(width: size.width * 0.46, height: 92)
                    .offset(x: -size.width * 0.28, y: -size.height * 0.28)
            }
        }
        .ignoresSafeArea()
    }

    private var topColor: Color {
        colorScheme == .dark
            ? Color(red: 0.04, green: 0.06, blue: 0.11)
            : AppTheme.lightTop
    }

    private var middleColor: Color {
        colorScheme == .dark
            ? Color(red: 0.06, green: 0.09, blue: 0.15)
            : AppTheme.lightMiddle
    }

    private var bottomColor: Color {
        colorScheme == .dark
            ? Color(red: 0.03, green: 0.05, blue: 0.09)
            : AppTheme.lightBottom
    }
}

struct LiquidGlassRoundedSurface: View {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat
    var tint: Color = AppTheme.primary
    var secondaryTint: Color = AppTheme.aqua
    var innerDarkness: Double = 0

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(baseGradient)

            if innerDarkness > 0 {
                RoundedRectangle(cornerRadius: max(cornerRadius - 6, 12), style: .continuous)
                    .fill(innerGradient)
                    .padding(4)
            }

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(borderGradient, lineWidth: 1)

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(topHighlight)
        }
        .shadow(color: tint.opacity(colorScheme == .dark ? 0.07 : 0.07), radius: 5, x: 0, y: 3)
    }

    private var baseGradient: LinearGradient {
        LinearGradient(
            colors: [
                (colorScheme == .dark ? Color.white : AppTheme.lightSurface).opacity(colorScheme == .dark ? 0.10 : 0.74),
                tint.opacity(colorScheme == .dark ? 0.12 : 0.10),
                secondaryTint.opacity(colorScheme == .dark ? 0.10 : 0.08),
                (colorScheme == .dark ? Color.black : AppTheme.lightSurfaceTint).opacity(colorScheme == .dark ? 0.15 : 0.30),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var innerGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.black.opacity(innerDarkness),
                tint.opacity(0.12),
                secondaryTint.opacity(0.10),
                Color.black.opacity(innerDarkness * 0.62),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.26 : 0.84),
                Color.white.opacity(colorScheme == .dark ? 0.08 : 0.18),
                secondaryTint.opacity(colorScheme == .dark ? 0.18 : 0.30),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var topHighlight: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.06 : 0.22),
                Color.white.opacity(0)
            ],
            startPoint: .top,
            endPoint: .center
        )
    }
}

struct LiquidGlassCapsuleSurface: View {
    @Environment(\.colorScheme) private var colorScheme

    var tint: Color = AppTheme.primary
    var secondaryTint: Color = AppTheme.aqua
    var innerDarkness: Double = 0

    var body: some View {
        ZStack {
            Capsule()
                .fill(baseGradient)

            if innerDarkness > 0 {
                Capsule()
                    .fill(innerGradient)
                    .padding(4)
            }

            Capsule()
                .strokeBorder(borderGradient, lineWidth: 1)

            Capsule()
                .fill(topHighlight)
        }
        .shadow(color: tint.opacity(colorScheme == .dark ? 0.07 : 0.07), radius: 5, x: 0, y: 3)
    }

    private var baseGradient: LinearGradient {
        LinearGradient(
            colors: [
                (colorScheme == .dark ? Color.white : AppTheme.lightSurface).opacity(colorScheme == .dark ? 0.10 : 0.72),
                tint.opacity(colorScheme == .dark ? 0.13 : 0.10),
                secondaryTint.opacity(colorScheme == .dark ? 0.10 : 0.08),
                (colorScheme == .dark ? Color.black : AppTheme.lightSurfaceTint).opacity(colorScheme == .dark ? 0.15 : 0.28),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var innerGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.black.opacity(innerDarkness),
                tint.opacity(0.18),
                secondaryTint.opacity(0.12),
                Color.black.opacity(innerDarkness * 0.62),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.28 : 0.88),
                Color.white.opacity(colorScheme == .dark ? 0.08 : 0.20),
                secondaryTint.opacity(colorScheme == .dark ? 0.18 : 0.30),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var topHighlight: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.06 : 0.22),
                Color.white.opacity(0)
            ],
            startPoint: .top,
            endPoint: .center
        )
    }
}

struct LiquidGlassCircleSurface: View {
    @Environment(\.colorScheme) private var colorScheme

    var tint: Color = AppTheme.primary
    var secondaryTint: Color = AppTheme.aqua
    var innerDarkness: Double = 0

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            (colorScheme == .dark ? Color.white : AppTheme.lightSurface).opacity(colorScheme == .dark ? 0.10 : 0.72),
                            tint.opacity(colorScheme == .dark ? 0.13 : 0.10),
                            secondaryTint.opacity(colorScheme == .dark ? 0.10 : 0.08),
                            (colorScheme == .dark ? Color.black : AppTheme.lightSurfaceTint).opacity(colorScheme == .dark ? 0.15 : 0.26),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            if innerDarkness > 0 {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.black.opacity(innerDarkness),
                                tint.opacity(0.14),
                                Color.black.opacity(innerDarkness * 0.62),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .padding(4)
            }

            Circle()
                .strokeBorder(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(colorScheme == .dark ? 0.28 : 0.86),
                            Color.white.opacity(colorScheme == .dark ? 0.08 : 0.18),
                            secondaryTint.opacity(colorScheme == .dark ? 0.16 : 0.28),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
        .shadow(color: tint.opacity(colorScheme == .dark ? 0.07 : 0.07), radius: 4, x: 0, y: 2)
    }
}

private struct LiquidGlassCardModifier: ViewModifier {
    let cornerRadius: CGFloat
    let tint: Color
    let secondaryTint: Color
    let innerDarkness: Double

    func body(content: Content) -> some View {
        content.background(
            LiquidGlassRoundedSurface(
                cornerRadius: cornerRadius,
                tint: tint,
                secondaryTint: secondaryTint,
                innerDarkness: innerDarkness
            )
        )
    }
}

private struct LiquidGlassCapsuleModifier: ViewModifier {
    let tint: Color
    let secondaryTint: Color
    let innerDarkness: Double

    func body(content: Content) -> some View {
        content.background(
            LiquidGlassCapsuleSurface(
                tint: tint,
                secondaryTint: secondaryTint,
                innerDarkness: innerDarkness
            )
        )
    }
}

private struct LiquidGlassCircleModifier: ViewModifier {
    let tint: Color
    let secondaryTint: Color
    let innerDarkness: Double

    func body(content: Content) -> some View {
        content.background(
            LiquidGlassCircleSurface(
                tint: tint,
                secondaryTint: secondaryTint,
                innerDarkness: innerDarkness
            )
        )
    }
}

extension View {
    func liquidGlassCard(
        cornerRadius: CGFloat = 28,
        tint: Color = AppTheme.primary,
        secondaryTint: Color = AppTheme.aqua,
        innerDarkness: Double = 0
    ) -> some View {
        modifier(
            LiquidGlassCardModifier(
                cornerRadius: cornerRadius,
                tint: tint,
                secondaryTint: secondaryTint,
                innerDarkness: innerDarkness
            )
        )
    }

    func liquidGlassCapsule(
        tint: Color = AppTheme.primary,
        secondaryTint: Color = AppTheme.aqua,
        innerDarkness: Double = 0
    ) -> some View {
        modifier(
            LiquidGlassCapsuleModifier(
                tint: tint,
                secondaryTint: secondaryTint,
                innerDarkness: innerDarkness
            )
        )
    }

    func liquidGlassCircle(
        tint: Color = AppTheme.primary,
        secondaryTint: Color = AppTheme.aqua,
        innerDarkness: Double = 0
    ) -> some View {
        modifier(
            LiquidGlassCircleModifier(
                tint: tint,
                secondaryTint: secondaryTint,
                innerDarkness: innerDarkness
            )
        )
    }
}

struct LiquidGlassProminentButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    var tint: Color = AppTheme.primary
    var secondaryTint: Color = AppTheme.aqua
    var height: CGFloat = 62

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(isEnabled ? 1 : 0.55))
            .padding(.horizontal, 20)
            .frame(minHeight: height)
            .frame(maxWidth: .infinity)
            .background(
                ZStack {
                    LiquidGlassCapsuleSurface(
                        tint: tint,
                        secondaryTint: secondaryTint,
                        innerDarkness: 0.22
                    )

                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color.black.opacity(configuration.isPressed ? 0.58 : 0.74),
                                    tint.opacity(configuration.isPressed ? 0.38 : 0.52),
                                    secondaryTint.opacity(configuration.isPressed ? 0.18 : 0.30),
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .padding(4)
                }
            )
            .scaleEffect(configuration.isPressed ? 0.986 : 1)
            .opacity(isEnabled ? 1 : 0.7)
            .animation(.spring(response: 0.28, dampingFraction: 0.82), value: configuration.isPressed)
    }
}

struct LiquidGlassSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    var tint: Color = .white
    var secondaryTint: Color = AppTheme.aqua
    var height: CGFloat = 56

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(
                colorScheme == .dark
                    ? Color.white.opacity(isEnabled ? 0.94 : 0.45)
                    : Color.primary.opacity(isEnabled ? 0.92 : 0.45)
            )
            .padding(.horizontal, 18)
            .frame(minHeight: height)
            .frame(maxWidth: .infinity)
            .background(
                ZStack {
                    LiquidGlassCapsuleSurface(
                        tint: tint,
                        secondaryTint: secondaryTint,
                        innerDarkness: colorScheme == .dark ? 0.08 : 0
                    )

                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(colorScheme == .dark ? 0.04 : 0.26),
                                    tint.opacity(colorScheme == .dark ? 0.02 : 0.10),
                                    secondaryTint.opacity(colorScheme == .dark ? 0.08 : 0.10),
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .padding(4)
                }
            )
            .scaleEffect(configuration.isPressed ? 0.988 : 1)
            .opacity(isEnabled ? 1 : 0.68)
            .animation(.spring(response: 0.26, dampingFraction: 0.82), value: configuration.isPressed)
    }
}
