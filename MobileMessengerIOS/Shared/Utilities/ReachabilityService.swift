import Foundation
import Network

public protocol ReachabilityService: Sendable {
    var isReachable: Bool { get }
    func observe() -> AsyncStream<Bool>
}

public final class DefaultReachabilityService: ReachabilityService {
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "reachability.queue")

    public init() {
        monitor = NWPathMonitor()
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
            monitor.pathUpdateHandler = { path in
                continuation.yield(path.status == .satisfied)
            }
            continuation.onTermination = { [monitor] _ in
                monitor.pathUpdateHandler = nil
            }
        }
    }
}
