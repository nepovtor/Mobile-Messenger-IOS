import SwiftUI
import UIKit

enum AuthMethod: String, CaseIterable, Identifiable {
    case phone
    case email

    var id: String { rawValue }

    var title: String {
        switch self {
        case .phone:
            return "Телефон"
        case .email:
            return "Почта"
        }
    }

    var placeholder: String {
        switch self {
        case .phone:
            return "+7 (999) 123-45-67"
        case .email:
            return "name@example.com"
        }
    }

    var keyboardType: UIKeyboardType {
        switch self {
        case .phone:
            return .phonePad
        case .email:
            return .emailAddress
        }
    }

    var textContentType: UITextContentType? {
        switch self {
        case .phone:
            return .telephoneNumber
        case .email:
            return .emailAddress
        }
    }

    var iconName: String {
        switch self {
        case .phone:
            return "phone.fill"
        case .email:
            return "envelope.fill"
        }
    }
}
