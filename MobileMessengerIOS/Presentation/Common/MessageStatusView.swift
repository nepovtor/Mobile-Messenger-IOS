import SwiftUI

struct MessageStatusView: View {
    let status: MessageStatus

    var body: some View {
        switch status {
        case .sending:
            Label("Отправка", systemImage: "paperplane")
                .labelStyle(.iconOnly)
                .foregroundColor(.secondary)
        case .sent:
            Image(systemName: "checkmark")
                .foregroundColor(.secondary)
        case .delivered:
            Image(systemName: "checkmark.circle")
                .foregroundColor(AppTheme.primary)
        case .read:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(AppTheme.mint)
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(AppTheme.coral)
        }
    }
}
