import Combine
import Foundation
import MatrixRustSDK
import SwiftUI

private enum MatrixVerificationEvent: Sendable {
    case request(SessionVerificationRequestDetails), accepted, started, data(SessionVerificationData), failed, cancelled, finished
}
private final class MatrixVerificationDelegate: SessionVerificationControllerDelegate, @unchecked Sendable {
    let update: @Sendable (MatrixVerificationEvent) -> Void
    init(_ update: @escaping @Sendable (MatrixVerificationEvent) -> Void) { self.update = update }
    func didReceiveVerificationRequest(details: SessionVerificationRequestDetails) { update(.request(details)) }
    func didAcceptVerificationRequest() { update(.accepted) }
    func didStartSasVerification() { update(.started) }
    func didReceiveVerificationData(data: SessionVerificationData) { update(.data(data)) }
    func didFail() { update(.failed) }
    func didCancel() { update(.cancelled) }
    func didFinish() { update(.finished) }
}

@MainActor
final class MatrixDeviceVerification: ObservableObject {
    enum Phase: Equatable { case idle, requested, waiting, comparing, done, cancelled, failed }
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var peer = ""
    @Published private(set) var device = ""
    @Published private(set) var symbols: [(String, String)] = []
    @Published private(set) var decimals: [UInt16] = []
    @Published private(set) var incoming = false
    private(set) var flowToken = UUID()
    private var details: SessionVerificationRequestDetails?
    private let controller: SessionVerificationController
    private var delegate: MatrixVerificationDelegate?
    private var active = true
    private let ownUserID: String
    private let onRequest: () -> Void
    private var outgoing = false
    private var approvedToken: UUID?

    static func open(client: Client, ownUserID: String, onRequest: @escaping () -> Void) async throws -> MatrixDeviceVerification {
        let controller = try await client.getSessionVerificationController()
        return MatrixDeviceVerification(controller: controller, ownUserID: ownUserID, onRequest: onRequest)
    }
    init(controller: SessionVerificationController, ownUserID: String, onRequest: @escaping () -> Void) {
        self.controller = controller; self.ownUserID = ownUserID; self.onRequest = onRequest
        installDelegate()
    }
    private func installDelegate() {
        let token = flowToken
        let delegate = MatrixVerificationDelegate { [weak self] event in
            Task { @MainActor in
                guard let self, self.flowToken == token else { return }
                self.handle(event)
            }
        }
        self.delegate = delegate; controller.setDelegate(delegate: delegate)
    }
    var isPending: Bool { phase == .requested || phase == .waiting || phase == .comparing }
    private func handle(_ event: MatrixVerificationEvent) {
        guard active else { return }
        switch event {
        case .request(let details):
            guard !isPending else { return }
            self.details = details; incoming = true; outgoing = false
            peer = details.senderProfile.userId; device = details.deviceId
            symbols = []; decimals = []; flowToken = UUID(); approvedToken = nil; installDelegate(); phase = .requested; onRequest()
        case .accepted:
            guard isPending else { return }
            phase = .waiting
            if outgoing { Task { do { try await controller.startSasVerification() } catch { if active { phase = .failed } } } }
        case .started: if isPending { phase = .waiting }
        case .data(let data):
            guard isPending else { return }
            switch data {
            case .emojis(let emojis, _): symbols = emojis.map { ($0.symbol(), $0.description()) }; decimals = []
            case .decimals(let values): decimals = values; symbols = []
            }
            phase = .comparing
        case .finished:
            guard approvedToken == flowToken else { return }
            symbols = []; decimals = []; phase = .done
        case .failed: symbols = []; decimals = []; phase = .failed
        case .cancelled: symbols = []; decimals = []; phase = .cancelled
        }
    }
    func request(userID: String? = nil) async throws {
        guard active, !isPending else { throw MatrixWorkspaceError.sessionClosed }
        flowToken = UUID(); approvedToken = nil; installDelegate(); details = nil; incoming = false; outgoing = true
        peer = userID ?? ownUserID; device = ""; symbols = []; decimals = []; phase = .waiting
        do {
            if let userID { try await controller.requestUserVerification(userId: userID) }
            else { try await controller.requestDeviceVerification() }
        } catch { if active { phase = .failed }; throw error }
    }
    func accept(token: UUID) async throws {
        guard active, token == flowToken, incoming, phase == .requested, let details else { throw MatrixWorkspaceError.sessionClosed }
        try await controller.acknowledgeVerificationRequest(senderId: details.senderProfile.userId, flowId: details.flowId)
        try await controller.acceptVerificationRequest()
        if active { phase = .waiting }
    }
    func confirm(token: UUID) async throws {
        guard active, token == flowToken, phase == .comparing, !symbols.isEmpty || !decimals.isEmpty else { throw MatrixWorkspaceError.sessionClosed }
        approvedToken = token; symbols = []; decimals = []; phase = .waiting
        try await controller.approveVerification()
    }
    func mismatch(token: UUID) async throws {
        guard active, token == flowToken, phase == .comparing else { throw MatrixWorkspaceError.sessionClosed }
        approvedToken = nil
        try await controller.declineVerification()
        if active { symbols = []; decimals = []; phase = .cancelled }
    }
    func cancel() async {
        guard phase != .done else { return }
        approvedToken = nil
        if active, isPending { try? await controller.cancelVerification() }
        if active { symbols = []; decimals = []; phase = .cancelled }
    }
    func close() {
        active = false; approvedToken = nil; controller.setDelegate(delegate: nil); delegate = nil
        symbols = []; decimals = []; details = nil; flowToken = UUID()
    }
}

@MainActor
struct MatrixDeviceVerificationView: View {
    @ObservedObject var verification: MatrixDeviceVerification
    @State private var error: String?
    private func perform(_ operation: @escaping () async throws -> Void) {
        Task { do { try await operation() } catch { self.error = "Не удалось завершить проверку. Повторите её на обоих устройствах" } }
    }
    var body: some View {
        let token = verification.flowToken
        VStack(alignment: .leading, spacing: 16) {
            Text("Проверка устройства").font(.title2)
            Text(verification.peer).font(.footnote).textSelection(.enabled)
            if !verification.device.isEmpty { Text(verification.device).font(.caption).foregroundStyle(.secondary) }
            switch verification.phase {
            case .idle: Text("Отправьте запрос с одного из устройств")
            case .requested:
                Text("Входящий запрос проверки")
                Button("Принять запрос") { perform { try await verification.accept(token: token) } }
            case .waiting: ProgressView("Дождитесь ответа на другом устройстве")
            case .comparing:
                Text("Сравните коды на двух устройствах лично или по доверенному звонку. Подтверждайте только при полном совпадении.")
                HStack { ForEach(Array(verification.symbols.enumerated()), id: \.offset) { _, value in Text(value.0).font(.largeTitle).accessibilityLabel(value.1) } }
                if !verification.decimals.isEmpty { Text(verification.decimals.map(String.init).joined(separator: " · ")).font(.title.monospacedDigit()) }
                Button("Коды совпадают") { perform { try await verification.confirm(token: token) } }
                Button("Не совпадают", role: .destructive) { perform { try await verification.mismatch(token: token) } }
            case .done: Label("Проверка завершена", systemImage: "checkmark.shield")
            case .cancelled: Text("Проверка отменена")
            case .failed: Text("Проверка не завершена. Повторите её на обоих устройствах")
            }
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            Button("Отменить проверку") { Task { await verification.cancel() } }
        }.padding(24)
    }
}
