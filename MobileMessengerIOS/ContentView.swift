import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "message.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.blue)
                    .padding(.bottom, 12)

                Text("Добро пожаловать в Mobile Messenger")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .multilineTextAlignment(.center)

                Text("Начните общаться с друзьями, создавая новые чаты и оставайтесь на связи в любое время.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button(action: {}) {
                    Text("Начать")
                        .font(.headline)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 24)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
            }
            .padding(24)
            .navigationTitle("Mobile Messenger")
        }
    }
}

#Preview {
    ContentView()
}
