import XCTest
import WebKit
@testable import Zupulse

final class BridgeRouterTests: XCTestCase {
    func testReturnsExactlyCorrelatedHandshake() throws {
        let router = BridgeRouter(appVersion: "0.1.0", rendererBuildHash: "fixture-build")

        guard case let .success(response) = router.handle(handshake()) else {
            return XCTFail("Expected handshake success")
        }
        XCTAssertEqual(response["bridgeVersion"] as? String, "3.0.0")
        XCTAssertEqual(response["correlationId"] as? String, "router-handshake")
        XCTAssertEqual(response["type"] as? String, "app.handshake")
        let payload = try XCTUnwrap(response["payload"] as? [String: Any])
        XCTAssertEqual(payload["appVersion"] as? String, "0.1.0")
        XCTAssertEqual(payload["bridgeVersion"] as? String, "3.0.0")
        XCTAssertEqual(payload["rendererBuildHash"] as? String, "fixture-build")
        XCTAssertNotNil(payload["capabilities"] as? [String: Any])
    }

    func testRejectsVersionAndBuildMismatches() {
        let router = BridgeRouter(appVersion: "0.1.0", rendererBuildHash: "fixture-build")
        var wrongApp = handshake()
        wrongApp["payload"] = ["appVersion": "9.0.0", "rendererBuildHash": "fixture-build"]
        var wrongBuild = handshake(correlationId: "router-build")
        wrongBuild["payload"] = ["appVersion": "0.1.0", "rendererBuildHash": "wrong-build"]

        for request in [wrongApp, wrongBuild] {
            guard case let .failure(error) = router.handle(request) else {
                return XCTFail("Expected handshake mismatch")
            }
            XCTAssertEqual(error.code, "BRIDGE_BUILD_MISMATCH")
            XCTAssertFalse(error.message.contains("fixture-build"))
        }
    }

    func testRejectsUnknownRequestsBeforeRouting() {
        let router = BridgeRouter(appVersion: "0.1.0", rendererBuildHash: "fixture-build")
        var request = handshake()
        request["type"] = "unknown.request"

        guard case let .failure(error) = router.handle(request) else {
            return XCTFail("Expected unknown request rejection")
        }
        XCTAssertEqual(error.code, "UNKNOWN_REQUEST_TYPE")
    }

    @MainActor
    func testBundledPageCompletesHandshakeBeforeRendering() async throws {
        let entryURL = try XCTUnwrap(
            Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web")
        )
        let coordinator = WebViewContainer.Coordinator(entryURL: entryURL)
        coordinator.webView.frame = CGRect(x: 0, y: 0, width: 834, height: 1194)
        try await Task.sleep(for: .seconds(3))

        let bodyText = try await coordinator.webView.evaluateJavaScript("document.body.innerText") as? String
        let diagnostics = try await coordinator.webView.evaluateJavaScript(
            """
            JSON.stringify({
              readyState: document.readyState,
              location: location.href,
              bodyHtml: document.body.innerHTML.slice(0, 500),
              rootChildren: document.getElementById("root")?.childElementCount ?? -1
            })
            """
        ) as? String

        XCTAssertFalse(
            try XCTUnwrap(bodyText).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            diagnostics ?? "missing diagnostics"
        )
        XCTAssertFalse(try XCTUnwrap(bodyText).contains("无法启动逐拍"), bodyText ?? "missing body text")
    }

    private func handshake(correlationId: String = "router-handshake") -> [String: Any] {
        [
            "bridgeVersion": "3.0.0",
            "correlationId": correlationId,
            "type": "app.handshake",
            "payload": [
                "appVersion": "0.1.0",
                "rendererBuildHash": "fixture-build",
            ],
        ]
    }
}
