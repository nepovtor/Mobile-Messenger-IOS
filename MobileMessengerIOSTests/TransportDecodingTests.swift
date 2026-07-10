@testable import MobileMessengerIOS
import XCTest

final class TransportDecodingTests: XCTestCase {
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

