import Foundation
import Network

public protocol ReachabilityService: Sendable {
    var isReachable: Bool { get }
    func observe() -> AsyncStream<Bool>
}

public final class DefaultReachabilityService: ReachabilityService, @unchecked Sendable {
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "reachability.queue")
    private let lock = NSLock()
    private var continuations: [UUID: AsyncStream<Bool>.Continuation] = [:]

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
            lock.lock()
            continuations[id] = continuation
            lock.unlock()

            continuation.yield(isReachable)
            continuation.onTermination = { [weak self] _ in
                self?.lock.lock()
                self?.continuations[id] = nil
                self?.lock.unlock()
            }
        }
    }

    private func broadcast(_ isReachable: Bool) {
        lock.lock()
        let activeContinuations = continuations.values
        lock.unlock()

        for continuation in activeContinuations {
            continuation.yield(isReachable)
        }
    }
}
