import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel: ChatViewModel

    init(viewModel: ChatViewModel = ChatViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        DialogueView(viewModel: viewModel)
    }
}

#Preview {
    ContentView()
}
