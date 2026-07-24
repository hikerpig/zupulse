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

    func testAppBundleDeclaresAnAppIcon() {
        let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any]
        let primaryIcon = icons?["CFBundlePrimaryIcon"] as? [String: Any]

        XCTAssertEqual(primaryIcon?["CFBundleIconName"] as? String, "AppIcon")
    }
}
