import SwiftUI

struct LiquidGlassBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var accent: Color = Color(red: 0.31, green: 0.48, blue: 1.00)
    var secondaryAccent: Color = Color(red: 0.09, green: 0.82, blue: 0.96)
    var tertiaryAccent: Color = Color(red: 0.94, green: 0.34, blue: 0.75)

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
                    .fill(accent.opacity(colorScheme == .dark ? 0.22 : 0.18))
                    .frame(width: size.width * 0.82, height: size.width * 0.82)
                    .blur(radius: 72)
                    .offset(x: size.width * 0.34, y: -size.height * 0.22)

                Circle()
                    .fill(secondaryAccent.opacity(colorScheme == .dark ? 0.18 : 0.16))
                    .frame(width: size.width * 0.74, height: size.width * 0.74)
                    .blur(radius: 78)
                    .offset(x: -size.width * 0.38, y: size.height * 0.18)

                RoundedRectangle(cornerRadius: 88, style: .continuous)
                    .fill(tertiaryAccent.opacity(colorScheme == .dark ? 0.14 : 0.12))
                    .frame(width: size.width * 0.58, height: size.width * 0.58)
                    .blur(radius: 68)
                    .rotationEffect(.degrees(18))
                    .offset(x: size.width * 0.30, y: size.height * 0.32)

                Capsule()
                    .fill(Color.white.opacity(colorScheme == .dark ? 0.10 : 0.40))
                    .frame(width: size.width * 0.46, height: 92)
                    .blur(radius: 24)
                    .offset(x: -size.width * 0.28, y: -size.height * 0.28)
            }
        }
        .ignoresSafeArea()
    }

    private var topColor: Color {
        colorScheme == .dark
            ? Color(red: 0.04, green: 0.06, blue: 0.11)
            : Color(red: 0.96, green: 0.97, blue: 0.99)
    }

    private var middleColor: Color {
        colorScheme == .dark
            ? Color(red: 0.06, green: 0.09, blue: 0.15)
            : Color(red: 0.92, green: 0.95, blue: 0.99)
    }

    private var bottomColor: Color {
        colorScheme == .dark
            ? Color(red: 0.03, green: 0.05, blue: 0.09)
            : Color(red: 0.94, green: 0.97, blue: 1.00)
    }
}

struct LiquidGlassRoundedSurface: View {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat
    var tint: Color = .blue
    var secondaryTint: Color = .cyan
    var innerDarkness: Double = 0

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.ultraThinMaterial)

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
                .strokeBorder(Color.white.opacity(colorScheme == .dark ? 0.16 : 0.55), lineWidth: 0.9)
                .mask(alignment: .top) {
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.white, .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: cornerRadius + 28)
                }

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [.clear, secondaryTint.opacity(colorScheme == .dark ? 0.34 : 0.46)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1.2
                )
                .blur(radius: 0.8)
                .mask(alignment: .bottom) {
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.clear, .white],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: cornerRadius + 24)
                }
        }
        .shadow(color: tint.opacity(colorScheme == .dark ? 0.16 : 0.18), radius: 20, x: 0, y: 10)
        .shadow(color: secondaryTint.opacity(colorScheme == .dark ? 0.10 : 0.14), radius: 28, x: 0, y: 18)
    }

    private var baseGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.10 : 0.54),
                tint.opacity(colorScheme == .dark ? 0.14 : 0.12),
                secondaryTint.opacity(colorScheme == .dark ? 0.12 : 0.10),
                Color.black.opacity(colorScheme == .dark ? 0.18 : 0.04),
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
                secondaryTint.opacity(0.14),
                Color.black.opacity(innerDarkness * 0.72),
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
                secondaryTint.opacity(colorScheme == .dark ? 0.24 : 0.42),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

struct LiquidGlassCapsuleSurface: View {
    @Environment(\.colorScheme) private var colorScheme

    var tint: Color = .blue
    var secondaryTint: Color = .cyan
    var innerDarkness: Double = 0

    var body: some View {
        ZStack {
            Capsule()
                .fill(.ultraThinMaterial)

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
                .strokeBorder(Color.white.opacity(colorScheme == .dark ? 0.16 : 0.58), lineWidth: 0.9)
                .mask(alignment: .top) {
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.white, .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: 34)
                }

            Capsule()
                .fill(
                    LinearGradient(
                        colors: [secondaryTint.opacity(0.34), .clear],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                )
                .frame(height: 18)
                .blur(radius: 10)
                .offset(y: 14)
        }
        .shadow(color: tint.opacity(colorScheme == .dark ? 0.18 : 0.16), radius: 18, x: 0, y: 10)
        .shadow(color: secondaryTint.opacity(colorScheme == .dark ? 0.14 : 0.12), radius: 24, x: 0, y: 16)
    }

    private var baseGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.10 : 0.52),
                tint.opacity(colorScheme == .dark ? 0.16 : 0.13),
                secondaryTint.opacity(colorScheme == .dark ? 0.13 : 0.11),
                Color.black.opacity(colorScheme == .dark ? 0.18 : 0.03),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var innerGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.black.opacity(innerDarkness),
                tint.opacity(0.28),
                secondaryTint.opacity(0.18),
                Color.black.opacity(innerDarkness * 0.72),
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
                secondaryTint.opacity(colorScheme == .dark ? 0.26 : 0.44),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

struct LiquidGlassCircleSurface: View {
    @Environment(\.colorScheme) private var colorScheme

    var tint: Color = .blue
    var secondaryTint: Color = .cyan
    var innerDarkness: Double = 0

    var body: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)

            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(colorScheme == .dark ? 0.10 : 0.52),
                            tint.opacity(colorScheme == .dark ? 0.16 : 0.14),
                            secondaryTint.opacity(colorScheme == .dark ? 0.12 : 0.10),
                            Color.black.opacity(colorScheme == .dark ? 0.18 : 0.03),
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
                                tint.opacity(0.22),
                                Color.black.opacity(innerDarkness * 0.72),
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
                            secondaryTint.opacity(colorScheme == .dark ? 0.22 : 0.40),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
        .shadow(color: tint.opacity(colorScheme == .dark ? 0.18 : 0.16), radius: 16, x: 0, y: 10)
        .shadow(color: secondaryTint.opacity(colorScheme == .dark ? 0.12 : 0.10), radius: 22, x: 0, y: 14)
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
        tint: Color = .blue,
        secondaryTint: Color = .cyan,
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
        tint: Color = .blue,
        secondaryTint: Color = .cyan,
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
        tint: Color = .blue,
        secondaryTint: Color = .cyan,
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

    var tint: Color = .blue
    var secondaryTint: Color = .cyan
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
    var secondaryTint: Color = .cyan
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
