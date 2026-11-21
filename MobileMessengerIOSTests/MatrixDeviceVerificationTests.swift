import MatrixRustSDK
import XCTest
@testable import MobileMessengerIOS

private final class VerificationControllerStub: SessionVerificationController, @unchecked Sendable {
    var delegate: SessionVerificationControllerDelegate?
    var approvals = 0
    var mismatches = 0
    init() { super.init(noHandle: .init()) }
    required init(unsafeFromHandle handle: UInt64) { super.init(unsafeFromHandle: handle) }
    override func setDelegate(delegate: SessionVerificationControllerDelegate?) { self.delegate = delegate }
    override func requestDeviceVerification() async throws {}
    override func startSasVerification() async throws {}
    override func approveVerification() async throws { approvals += 1 }
    override func declineVerification() async throws { mismatches += 1 }
    override func cancelVerification() async throws {}
}

@MainActor
final class MatrixDeviceVerificationTests: XCTestCase {
    func testSasRequiresExplicitConfirmationAndSdkCompletion() async throws {
        let sdk = VerificationControllerStub()
        let verification = MatrixDeviceVerification(controller: sdk, ownUserID: "@own:example", onRequest: {})
        try await verification.request()
        sdk.delegate?.didReceiveVerificationData(data: .decimals(values: [1234, 5678, 4321]))
        await Task.yield()
        XCTAssertEqual(sdk.approvals, 0)
        XCTAssertEqual(verification.phase, .comparing)
        do { try await verification.confirm(token: UUID()); XCTFail("A stale screen must not approve a new flow") } catch {}
        XCTAssertEqual(sdk.approvals, 0)
        try await verification.confirm(token: verification.flowToken)
        XCTAssertEqual(sdk.approvals, 1)
        XCTAssertEqual(verification.phase, .waiting)
        sdk.delegate?.didFinish(); await Task.yield()
        XCTAssertEqual(verification.phase, .done)
        verification.close()
    }

    func testUnapprovedOrOldDelegateCannotMarkAFlowVerified() async throws {
        let sdk = VerificationControllerStub()
        let verification = MatrixDeviceVerification(controller: sdk, ownUserID: "@own:example", onRequest: {})
        let old = sdk.delegate
        try await verification.request()
        old?.didReceiveVerificationData(data: .decimals(values: [1234, 5678, 4321]))
        old?.didFinish(); await Task.yield()
        XCTAssertEqual(verification.phase, .waiting)
        sdk.delegate?.didFinish(); await Task.yield()
        XCTAssertNotEqual(verification.phase, .done)
        sdk.delegate?.didReceiveVerificationData(data: .decimals(values: [1234, 5678, 4321])); await Task.yield()
        try await verification.mismatch(token: verification.flowToken)
        XCTAssertEqual(sdk.mismatches, 1)
        XCTAssertEqual(sdk.approvals, 0)
        verification.close()
    }
}
