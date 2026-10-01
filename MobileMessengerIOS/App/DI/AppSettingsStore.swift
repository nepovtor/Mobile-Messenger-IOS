import SwiftUI

@MainActor
public final class AppSettingsStore: ObservableObject {
    public enum AppearanceMode: String, CaseIterable, Identifiable {
        case system
        case light
        case dark

        public var id: String { rawValue }

        public var title: String {
            switch self {
            case .system: "Системная"
            case .light: "Светлая"
            case .dark: "Тёмная"
            }
        }

        public var systemImage: String {
            switch self {
            case .system: "gearshape.2.fill"
            case .light: "sun.max.fill"
            case .dark: "moon.fill"
            }
        }

        public var colorScheme: ColorScheme? {
            switch self {
            case .system: nil
            case .light: .light
            case .dark: .dark
            }
        }
    }

    private enum DefaultsKeys {
        static let appearanceMode = "ui.appearance_mode"
        static let highContrastDarkMode = "ui.high_contrast_dark_mode"
        static let showPhoneNumberInProfile = "profile.show_phone_number"
        static let showTechnicalDetailsInProfile = "profile.show_technical_details"
    }

    private let defaults: UserDefaults
    @Published public private(set) var appearanceMode: AppearanceMode
    @Published public private(set) var highContrastDarkMode: Bool
    @Published public private(set) var showPhoneNumberInProfile: Bool
    @Published public private(set) var showTechnicalDetailsInProfile: Bool

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        appearanceMode = AppearanceMode(
            rawValue: defaults.string(forKey: DefaultsKeys.appearanceMode) ?? ""
        ) ?? .system
        highContrastDarkMode = defaults.object(forKey: DefaultsKeys.highContrastDarkMode) as? Bool ?? true
        showPhoneNumberInProfile = defaults.object(forKey: DefaultsKeys.showPhoneNumberInProfile) as? Bool ?? true
        showTechnicalDetailsInProfile =
            defaults.object(forKey: DefaultsKeys.showTechnicalDetailsInProfile) as? Bool ??
            Self.defaultShowTechnicalDetailsInProfile
    }

    public func updateAppearanceMode(_ mode: AppearanceMode) {
        appearanceMode = mode
        defaults.set(mode.rawValue, forKey: DefaultsKeys.appearanceMode)
    }

    public func updateHighContrastDarkMode(_ isEnabled: Bool) {
        highContrastDarkMode = isEnabled
        defaults.set(isEnabled, forKey: DefaultsKeys.highContrastDarkMode)
    }

    public func updateShowPhoneNumberInProfile(_ isEnabled: Bool) {
        showPhoneNumberInProfile = isEnabled
        defaults.set(isEnabled, forKey: DefaultsKeys.showPhoneNumberInProfile)
    }

    public func updateShowTechnicalDetailsInProfile(_ isEnabled: Bool) {
        showTechnicalDetailsInProfile = isEnabled
        defaults.set(isEnabled, forKey: DefaultsKeys.showTechnicalDetailsInProfile)
    }

    private static var defaultShowTechnicalDetailsInProfile: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
}
