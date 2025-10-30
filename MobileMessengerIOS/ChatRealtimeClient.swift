import Foundation

protocol ChatRealtimeClient {
    var onMessage: ((String) -> Void)? { get set }
    var onTyping: ((Bool) -> Void)? { get set }
    func connect()
    func disconnect()
    func send(text: String)
}

final class DefaultChatRealtimeClient: NSObject, ChatRealtimeClient {
    private enum Transport {
        case webSocket(URLSession, URLSessionWebSocketTask)
        case stub
    }

    var onMessage: ((String) -> Void)?
    var onTyping: ((Bool) -> Void)?

    private var transport: Transport?
    private var receiveTask: Task<Void, Never>?
    private var pollingTask: Task<Void, Never>?

    override init() {
        super.init()

        if let url = DefaultChatRealtimeClient.resolveWebSocketURL() {
            let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
            let task = session.webSocketTask(with: url)
            self.transport = .webSocket(session, task)
        } else {
            self.transport = .stub
        }
    }

    func connect() {
        switch transport {
        case .webSocket(_, let task):
            task.resume()
            listenForMessages(on: task)
        case .stub:
            startStubLongPolling()
        case .none:
            break
        }
    }

    func disconnect() {
        receiveTask?.cancel()
        receiveTask = nil
        pollingTask?.cancel()
        pollingTask = nil

        if case .webSocket(_, let task) = transport {
            task.cancel(with: .normalClosure, reason: nil)
        }
    }

    func send(text: String) {
        switch transport {
        case .webSocket(_, let task):
            let message = URLSessionWebSocketTask.Message.string(text)
            task.send(message) { [weak self] error in
                if let error = error {
                    self?.handleError(error)
                }
            }
        case .stub:
            simulateStubResponse(to: text)
        case .none:
            break
        }
    }

    private func listenForMessages(on task: URLSessionWebSocketTask) {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    switch message {
                    case .string(let text):
                        await MainActor.run {
                            self.onMessage?(text)
                        }
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            await MainActor.run {
                                self.onMessage?(text)
                            }
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    self.handleError(error)
                    break
                }
            }
        }
    }

    private func startStubLongPolling() {
        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            var counter = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                counter += 1
                await self?.emitTyping(true)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                await self?.emitTyping(false)
                await self?.emitMessage("Сообщение #\(counter) из заглушки")
            }
        }
    }

    private func simulateStubResponse(to text: String) {
        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            await self?.emitTyping(true)
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            await self?.emitTyping(false)
            let reply = "Получено: \(text)"
            await self?.emitMessage(reply)
            self?.startStubLongPolling()
        }
    }

    private func emitMessage(_ message: String) async {
        await MainActor.run {
            onMessage?(message)
        }
    }

    private func emitTyping(_ typing: Bool) async {
        await MainActor.run {
            onTyping?(typing)
        }
    }

    private func handleError(_ error: Error) {
        #if DEBUG
        print("WebSocket error: \(error.localizedDescription)")
        #endif
    }

    private static func resolveWebSocketURL() -> URL? {
        guard let urlString = Bundle.main.object(forInfoDictionaryKey: "CHAT_WS_URL") as? String,
              let url = URL(string: urlString),
              !urlString.isEmpty else {
            return nil
        }
        return url
    }
}

extension DefaultChatRealtimeClient: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        #if DEBUG
        print("WebSocket connected")
        #endif
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        #if DEBUG
        print("WebSocket closed with code: \(closeCode.rawValue)")
        #endif
    }
}
