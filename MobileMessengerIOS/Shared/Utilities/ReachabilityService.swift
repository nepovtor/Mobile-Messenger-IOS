import Foundation
import Network

public protocol ReachabilityService: Sendable {
    var isReachable: Bool { get }
    func observe() -> AsyncStream<Bool>
}

public final class DefaultReachabilityService: ReachabilityService, @unchecked Sendable {
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "reachability.queue")
    private var observers: [UUID: AsyncStream<Bool>.Continuation] = [:]

    public init() {
        monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.broadcast(path.status == .satisfied)
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }

    public var isReachable: Bool {
        monitor.currentPath.status == .satisfied
    }

    public func observe() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            let id = UUID()
            queue.async { [weak self] in
                guard let self else { return }
                observers[id] = continuation
                continuation.yield(monitor.currentPath.status == .satisfied)
            }
            continuation.onTermination = { [weak self] _ in
                self?.queue.async {
                    self?.observers[id] = nil
                }
            }
        }
    }

    private func broadcast(_ isReachable: Bool) {
        queue.async { [weak self] in
            self?.observers.values.forEach { continuation in
                continuation.yield(isReachable)
            }
        }
    }
}
