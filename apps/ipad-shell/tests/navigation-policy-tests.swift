import XCTest
@testable import Zupulse

final class NavigationPolicyTests: XCTestCase {
    private let policy = NavigationPolicy()

    func testAllowsOnlyTheBundledApplicationOriginInsideTheWebView() {
        XCTAssertEqual(
            policy.decide(
                url: URL(string: "zupulse://app/index.html"),
                isMainFrame: true,
                isUserInitiated: false
            ),
            .allow
        )
        for value in [
            "zupulse://other/index.html",
            "zupulse://app.evil/index.html",
            "file:///private/tmp/index.html",
            "javascript:alert(1)",
            "custom://host/path",
        ] {
            XCTAssertEqual(
                policy.decide(
                    url: URL(string: value),
                    isMainFrame: true,
                    isUserInitiated: true
                ),
                .cancel
            )
        }
    }

    func testOpensOnlyUserActivatedTopLevelHTTPSLinksExternally() {
        let externalURL = URL(string: "https://example.com/help")!
        XCTAssertEqual(
            policy.decide(
                url: externalURL,
                isMainFrame: true,
                isUserInitiated: true
            ),
            .openExternally(externalURL)
        )
        XCTAssertEqual(
            policy.decide(
                url: externalURL,
                isMainFrame: true,
                isUserInitiated: false
            ),
            .cancel
        )
        XCTAssertEqual(
            policy.decide(
                url: externalURL,
                isMainFrame: false,
                isUserInitiated: true
            ),
            .cancel
        )
    }

    func testRejectsPopupRedirectAndMalformedDestinations() {
        XCTAssertEqual(
            policy.decide(url: nil, isMainFrame: true, isUserInitiated: true),
            .cancel
        )
        XCTAssertEqual(
            policy.decide(
                url: URL(string: "http://example.com"),
                isMainFrame: true,
                isUserInitiated: true
            ),
            .cancel
        )
        XCTAssertEqual(
            policy.decide(
                url: URL(string: "https://example.com"),
                isMainFrame: true,
                isUserInitiated: false
            ),
            .cancel
        )
    }
}
