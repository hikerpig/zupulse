import Foundation
import XCTest
@testable import Zupulse

final class BridgeContractTests: XCTestCase {
    func testSharedFixturesMatchSwiftValidation() throws {
        let fixtures = try loadFixtures()

        for fixture in fixtures {
            let validator = BridgeContractValidator()
            let data = try JSONSerialization.data(withJSONObject: fixture.value)

            switch validator.validate(data) {
            case .success:
                XCTAssertTrue(fixture.accepted, fixture.name)
            case .failure:
                XCTAssertFalse(fixture.accepted, fixture.name)
            }
        }
    }

    func testRejectsDuplicateCorrelationId() throws {
        let fixture = try XCTUnwrap(loadFixtures().first(where: \.accepted))
        let data = try JSONSerialization.data(withJSONObject: fixture.value)
        let validator = BridgeContractValidator()

        guard case .success = validator.validate(data) else {
            return XCTFail("The first request should be accepted")
        }
        guard case let .failure(error) = validator.validate(data) else {
            return XCTFail("The duplicate request should be rejected")
        }
        XCTAssertEqual(error.code, "DUPLICATE_CORRELATION_ID")
    }

    func testValidationErrorsDoNotContainRawPayload() throws {
        let fixture = try XCTUnwrap(loadFixtures().first(where: { $0.name == "unknown bridge version" }))
        let data = try JSONSerialization.data(withJSONObject: fixture.value)
        let validator = BridgeContractValidator()

        guard case let .failure(error) = validator.validate(data) else {
            return XCTFail("The invalid request should be rejected")
        }
        let encodedError = String(decoding: try JSONEncoder().encode(error), as: UTF8.self)
        XCTAssertFalse(encodedError.contains("fixture-build"))
        XCTAssertFalse(encodedError.contains("payload"))
    }

    private func loadFixtures() throws -> [Fixture] {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "ipad-bridge", withExtension: "json"))
        let data = try Data(contentsOf: url)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let requests = try XCTUnwrap(object["requests"] as? [[String: Any]])
        return try requests.map { request in
            Fixture(
                name: try XCTUnwrap(request["name"] as? String),
                accepted: try XCTUnwrap(request["accepted"] as? Bool),
                value: try XCTUnwrap(request["value"] as? [String: Any])
            )
        }
    }
}

private struct Fixture {
    let name: String
    let accepted: Bool
    let value: [String: Any]
}
