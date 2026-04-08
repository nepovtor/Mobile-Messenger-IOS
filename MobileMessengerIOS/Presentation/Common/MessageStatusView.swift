import SwiftUI

struct MessageStatusView: View {
    let status: MessageStatus

    var body: some View {
        switch status {
        case .sending:
            Label(AppLanguagePreference.localized(ru: "Отправка", en: "Sending"), systemImage: "paperplane")
                .labelStyle(.iconOnly)
                .foregroundColor(.secondary)
        case .sent:
            Image(systemName: "checkmark")
                .foregroundColor(.secondary)
        case .delivered:
            Image(systemName: "checkmark.circle")
                .foregroundColor(.blue)
        case .read:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
        }
    }
}
