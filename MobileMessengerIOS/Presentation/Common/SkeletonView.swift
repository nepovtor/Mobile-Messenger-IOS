import SwiftUI

struct SkeletonView: View {
    let isActive: Bool

    var body: some View {
        Rectangle()
            .fill(LinearGradient(colors: [Color.gray.opacity(0.3), Color.gray.opacity(0.1), Color.gray.opacity(0.3)], startPoint: .leading, endPoint: .trailing))
            .redacted(reason: isActive ? .placeholder : [])
            .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isActive)
    }
}
