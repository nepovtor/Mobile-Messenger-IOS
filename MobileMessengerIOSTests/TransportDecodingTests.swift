@testable import MobileMessengerIOS
import Foundation
import UserNotifications
import XCTest

final class TransportDecodingTests: XCTestCase {
    func testAPIErrorTechnicalDetailsDoNotContainResponseBodyOrRequestURL() async throws {
        let secret = "sensitive-token-and-message"
        RedactingURLProtocol.requestHandler = { request in
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 500,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )
            )
            let body = Data(#"{"message":"\#(secret)"}"#.utf8)
            return (response, body)
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RedactingURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer {
            session.invalidateAndCancel()
            RedactingURLProtocol.requestHandler = nil
        }

        let url = try XCTUnwrap(
            URL(string: "https://example.test/api/push/device/\(secret)")
        )
        let request = URLRequest(url: url)

        do {
            let _: SanitizedTestResponse = try await APIResponseParser.requestJSON(
                request,
                using: session
            )
            XCTFail("Expected the request to fail")
        } catch let error as APIResponseParser.ParseError {
            let details = try XCTUnwrap(error.technicalDetails)
            XCTAssertEqual(
                details,
                "Reason: HTTP status was not successful, status: 500."
            )
            XCTAssertFalse(details.contains(secret))
            XCTAssertFalse(details.localizedCaseInsensitiveContains("preview"))
            XCTAssertFalse(details.localizedCaseInsensitiveContains("url"))
        }
    }

    func testGenericPushContentDropsServerProvidedMessageText() {
        let chatID = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"
        let serverContent = UNMutableNotificationContent()
        serverContent.title = "Имя отправителя"
        serverContent.subtitle = "Название чата"
        serverContent.body = "Секретный текст сообщения"
        serverContent.badge = 4
        serverContent.userInfo = [
            "chatId": chatID,
            "messageId": "message-id",
            "text": "Секретный текст сообщения"
        ]

        let genericContent = PushNotificationManager.genericNotificationContent(
            preservingRoutingFrom: serverContent
        )

        XCTAssertEqual(genericContent.title, "Новое сообщение")
        XCTAssertEqual(genericContent.body, "")
        XCTAssertEqual(genericContent.badge, 4)
        XCTAssertEqual(genericContent.userInfo["chatId"] as? String, chatID)
        XCTAssertNil(genericContent.userInfo["messageId"])
        XCTAssertNil(genericContent.userInfo["text"])
    }

    func testIOSAuthRequestsIncludeStableGenericDeviceHeaders() async throws {
        let deviceID = "11111111-2222-3333-4444-555555555555"
        let requestRecorder = URLRequestRecorder()

        RedactingURLProtocol.requestHandler = { request in
            requestRecorder.record(request)

            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )
            )
            let path = try XCTUnwrap(request.url?.path)
            let body: Data
            if path.hasSuffix("/auth/request") {
                body = Data(
                    #"{"status":"code_sent","delivery":"telegram","resendAfterSeconds":60,"expiresIn":300}"#.utf8
                )
            } else {
                body = Data(
                    #"{"token":"ios-access-token","refreshToken":"ios-refresh-token","userID":"AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE","displayName":"Анна Demo","phone":"+15551230011"}"#.utf8
                )
            }
            return (response, body)
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RedactingURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer {
            session.invalidateAndCancel()
            RedactingURLProtocol.requestHandler = nil
        }

        let service = RESTAuthService(
            baseURL: try XCTUnwrap(URL(string: "https://example.test/api")),
            session: session,
            deviceID: deviceID
        )

        _ = try await service.requestCode(method: .phone, contact: "+15551230011")
        _ = try await service.verifyCode(
            method: .phone,
            contact: "+15551230011",
            code: "123456"
        )
        _ = try await service.signIn(
            method: .phone,
            contact: "+15551230011",
            password: "password"
        )

        let requests = requestRecorder.snapshot()

        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(
            requests.compactMap(\.url?.path),
            ["/api/auth/request", "/api/auth/verify", "/api/auth/login"]
        )
        for request in requests {
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Client-Platform"),
                "ios"
            )
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Device-ID"),
                deviceID
            )
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Device-Name"),
                "Mobile Messenger iOS"
            )
        }
    }

    func testAuthVerifyResponseDecodesVerifyPayload() throws {
        let userID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))
        let payload = """
        {
          "token": "demo-token",
          "userID": "\(userID.uuidString)",
          "displayName": "Анна Demo",
          "phone": "+15551230011"
        }
        """

        let response = try JSONDecoder().decode(AuthVerifyResponse.self, from: Data(payload.utf8))

        XCTAssertEqual(response.token, "demo-token")
        XCTAssertEqual(response.userID, userID)
        XCTAssertEqual(response.displayName, "Анна Demo")
        XCTAssertEqual(response.phone, "+15551230011")
    }

    func testAuthRequestResponseDecodesCooldownPayload() throws {
        let payload = """
        {
          "status": "code_sent",
          "delivery": "telegram",
          "resendAfterSeconds": 60,
          "expiresIn": 300
        }
        """

        let response = try JSONDecoder().decode(AuthCodeResponse.self, from: Data(payload.utf8))

        XCTAssertEqual(response.status, "code_sent")
        XCTAssertEqual(response.delivery, "telegram")
        XCTAssertEqual(response.resendAfterSeconds, 60)
        XCTAssertEqual(response.expiresIn, 300)
    }

    func testAuthRequestResponseDecodesLegacyMinimalPayload() throws {
        let payload = """
        {
          "expiresIn": 300
        }
        """

        let response = try JSONDecoder().decode(AuthCodeResponse.self, from: Data(payload.utf8))

        XCTAssertEqual(response.status, "code_sent")
        XCTAssertEqual(response.delivery, "telegram")
        XCTAssertEqual(response.resendAfterSeconds, 60)
        XCTAssertEqual(response.expiresIn, 300)
    }

    func testContactDTODecodesDirectChatAndDuplicateFlag() throws {
        let payload = """
        {
          "id": "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEE1",
          "userID": "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEE2",
          "displayName": "Борис Demo",
          "phone": "+15551230012",
          "createdAt": "2026-05-01T00:00:00.000Z",
          "directChatID": "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEE3",
          "alreadyExists": true
        }
        """

        let contact = try JSONDecoder().decode(ContactDTO.self, from: Data(payload.utf8))

        XCTAssertEqual(contact.displayName, "Борис Demo")
        XCTAssertEqual(contact.phone, "+15551230012")
        XCTAssertEqual(contact.alreadyExists, true)
        XCTAssertEqual(contact.directChatID?.uuidString, "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEE3")
    }

    func testUserProfileDTODecodesProfileUpdatePayload() throws {
        let payload = """
        {
          "userID": "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEE4",
          "displayName": "Новое имя",
          "phone": "+15551230011"
        }
        """

        let profile = try JSONDecoder().decode(UserProfileDTO.self, from: Data(payload.utf8))

        XCTAssertEqual(profile.displayName, "Новое имя")
        XCTAssertEqual(profile.phone, "+15551230011")
        XCTAssertEqual(profile.userID.uuidString, "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEE4")
    }

    func testTelegramNotLinkedErrorMappingIsUserFriendly() {
        let error = APIResponseParser.ParseError(
            userMessage: "Link Telegram in the app first and send your own contact to the bot before requesting a code.",
            technicalDetails: nil,
            isRetryable: false,
            statusCode: 400,
            backendCode: "TELEGRAM_NOT_LINKED"
        )

        XCTAssertEqual(
            AppError.presentableMessage(for: error),
            "Сначала привяжите Telegram через кнопку выше и отправьте свой контакт боту."
        )
    }

    @MainActor
    func testTelegramBotURLBuildsCorrectly() {
        let viewModel = AuthViewModel(
            authService: AuthServiceSpy(),
            sessionStore: makeSessionStore(),
            telegramBotURL: URL(string: "https://t.me/mobile_demo_bot")
        )

        XCTAssertEqual(viewModel.telegramBotURL?.absoluteString, "https://t.me/mobile_demo_bot")
    }

    func testTelegramPairingResponseDecodesAndBuildsStartURL() throws {
        let payload = """
        {
          "botUsername": "mobile_demo_bot",
          "telegramStartUrl": "https://t.me/mobile_demo_bot?start=secure-pair-token",
          "expiresIn": 600
        }
        """

        let response = try JSONDecoder().decode(TelegramPairingResponse.self, from: Data(payload.utf8))

        XCTAssertEqual(response.botUsername, "mobile_demo_bot")
        XCTAssertEqual(response.expiresIn, 600)
        XCTAssertEqual(response.startURL?.absoluteString, "https://t.me/mobile_demo_bot?start=secure-pair-token")
    }

    @MainActor
    func testDefaultConfigUsesFallbackTelegramBotUsername() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let config = DefaultConfigService(
            bundle: Bundle(for: Self.self),
            defaults: defaults
        )

        XCTAssertEqual(config.telegramBotUsername, "verificMobileMessengerIOSbot")
        XCTAssertEqual(config.telegramBotURL?.absoluteString, "https://t.me/verificMobileMessengerIOSbot")
    }

    @MainActor
    func testSessionStoreLogoutClearsTokenAndSession() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let tokenStore = InMemoryTokenStore()
        let sessionStore = SessionStore(tokenStore: tokenStore, defaults: defaults)

        sessionStore.authenticate(
            with: "demo-token",
            userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            displayName: "Анна Demo"
        )
        sessionStore.logout()

        XCTAssertNil(tokenStore.retrieveToken())
        XCTAssertNil(sessionStore.currentUserID)
        XCTAssertNil(sessionStore.currentDisplayName)
        XCTAssertNil(sessionStore.authToken)
    }

    func testServerChatDecodesProductionDTOFields() throws {
        let chatID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE01"))
        let payload = """
        {
          "id": "\(chatID.uuidString)",
          "title": "Demo Team",
          "participants": ["Анна Demo", "Борис Demo", "Глеб Demo"],
          "lastMessage": "Всем привет",
          "updatedAt": "2026-04-24T12:34:56.789Z"
        }
        """

        let chat = try JSONDecoder.mobileMessengerISO8601().decode(ServerChat.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.fractional.date(from: "2026-04-24T12:34:56.789Z"))

        XCTAssertEqual(chat.id, chatID)
        XCTAssertEqual(chat.title, "Demo Team")
        XCTAssertEqual(chat.participantNames, ["Анна Demo", "Борис Demo", "Глеб Demo"])
        XCTAssertEqual(chat.lastMessagePreview, "Всем привет")
        XCTAssertEqual(chat.participantCount, 3)
        XCTAssertEqual(chat.lastActivity, expectedDate)
    }

    func testServerMessageDecodesProductionDTOFields() throws {
        let messageID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE02"))
        let chatID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE03"))
        let senderID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE04"))
        let clientMessageID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE05"))
        let payload = """
        {
          "id": "\(messageID.uuidString)",
          "chatID": "\(chatID.uuidString)",
          "senderID": "\(senderID.uuidString)",
          "senderName": "Борис Demo",
          "kind": "text",
          "text": "Привет из websocket",
          "createdAt": "2026-04-24T12:34:56Z",
          "clientMessageId": "\(clientMessageID.uuidString)"
        }
        """

        let message = try JSONDecoder.mobileMessengerISO8601().decode(ServerMessage.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.basic.date(from: "2026-04-24T12:34:56Z"))

        XCTAssertEqual(message.id, messageID)
        XCTAssertEqual(message.chatID, chatID)
        XCTAssertEqual(message.authorID, senderID)
        XCTAssertEqual(message.authorName, "Борис Demo")
        XCTAssertEqual(message.text, "Привет из websocket")
        XCTAssertEqual(message.messageID, clientMessageID)
        XCTAssertEqual(message.createdAt, expectedDate)
    }

    func testSharedDecoderSupportsISO8601WithoutFractionalSeconds() throws {
        struct Payload: Decodable {
            let createdAt: Date
        }

        let payload = #"{"createdAt":"2026-04-24T12:34:56Z"}"#

        let decoded = try JSONDecoder.mobileMessengerISO8601().decode(Payload.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.basic.date(from: "2026-04-24T12:34:56Z"))

        XCTAssertEqual(decoded.createdAt, expectedDate)
    }

    func testSharedDecoderSupportsISO8601WithFractionalSeconds() throws {
        struct Payload: Decodable {
            let createdAt: Date
        }

        let payload = #"{"createdAt":"2026-04-24T12:34:56.789Z"}"#

        let decoded = try JSONDecoder.mobileMessengerISO8601().decode(Payload.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.fractional.date(from: "2026-04-24T12:34:56.789Z"))

        XCTAssertEqual(decoded.createdAt, expectedDate)
    }
}

private struct SanitizedTestResponse: Decodable {
    let ok: Bool
}

private final class URLRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var requests: [URLRequest] = []

    func record(_ request: URLRequest) {
        lock.lock()
        requests.append(request)
        lock.unlock()
    }

    func snapshot() -> [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return requests
    }
}

private final class RedactingURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let requestHandler = Self.requestHandler else {
            client?.urlProtocol(
                self,
                didFailWithError: URLError(.unknown)
            )
            return
        }

        do {
            let (response, data) = try requestHandler(request)
            client?.urlProtocol(
                self,
                didReceive: response,
                cacheStoragePolicy: .notAllowed
            )
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
