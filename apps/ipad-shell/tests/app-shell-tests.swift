import XCTest
@testable import Zupulse

final class AppShellTests: XCTestCase {
    func testAppBundleIdentifierIsConfigured() {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.hikerpig.zupulse")
    }
}
