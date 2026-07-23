import XCTest
@testable import Zupulse

final class AppShellTests: XCTestCase {
    func testAppBundleIdentifierIsConfigured() {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.hikerpig.zupulse")
    }

    func testAppAllowsIPadMultitasking() {
        XCTAssertNotEqual(
            Bundle.main.object(forInfoDictionaryKey: "UIRequiresFullScreen") as? Bool,
            true
        )
    }
}
