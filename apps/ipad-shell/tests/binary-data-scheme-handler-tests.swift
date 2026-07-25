import Foundation
import UIKit
import WebKit
import XCTest
@testable import Zupulse

final class BinarySchemeTests: XCTestCase {
    @MainActor
    func testWebViewFetchConsumesTokenAcrossCustomSchemeOrigins() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).musicxml")
        try Data([1, 2, 3]).write(to: fileURL)
        defer { try? FileManager.default.removeItem(at: fileURL) }
        let store = FileTokenStore()
        let token = try await store.issue(
            url: fileURL,
            fileName: fileURL.lastPathComponent,
            sizeBytes: 3
        )
        let configuration = WKWebViewConfiguration()
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: rootURL) }
        try Data(
            """
            <!doctype html>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'self' zupulse:">
            <title>fixture</title>
            """.utf8
        ).write(
            to: rootURL.appendingPathComponent("index.html")
        )
        configuration.setURLSchemeHandler(
            AppResourceSchemeHandler(
                rootURL: rootURL,
                binaryService: BinaryDataService(store: store)
            ),
            forURLScheme: AppResourceSchemeHandler.scheme
        )
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), configuration: configuration)
        let viewController = UIViewController()
        viewController.view.addSubview(webView)
        let window = UIWindow(frame: webView.frame)
        window.rootViewController = viewController
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let navigation = NavigationSpy()
        let loaded = expectation(description: "custom-scheme page loaded")
        navigation.onFinish = { loaded.fulfill() }
        webView.navigationDelegate = navigation
        webView.load(URLRequest(url: AppResourceSchemeHandler.entryURL))
        await fulfillment(of: [loaded], timeout: 15)
        let result: Any?
        do {
            result = try await webView.callAsyncJavaScript(
                """
                const response = await fetch("/__data/\(token)");
                return Array.from(new Uint8Array(await response.arrayBuffer()));
                """,
                arguments: [:],
                in: nil,
                contentWorld: .page
            )
        } catch {
            let tokenCount = await store.outstandingCount
            XCTFail("WKWEBVIEW_FETCH_FAILED:tokens=\(tokenCount)")
            return
        }

        XCTAssertEqual(result as? [Int], [1, 2, 3])
    }

    func testAcceptsOnlyAnExactSingleTokenURL() throws {
        let resolver = BinaryDataRequestResolver()
        let token = UUID().uuidString.lowercased()

        XCTAssertEqual(try resolver.token(from: URL(string: "zupulse-data://file/\(token)")), token)
        for value in [
            "zupulse-data://other/\(token)",
            "zupulse-data://file/",
            "zupulse-data://file/\(token)/extra",
            "zupulse-data://file/not-a-token",
            "zupulse-data://file/\(token)?read=1",
            "zupulse-data://file/\(token)#fragment",
            "zupulse-data://user@file/\(token)",
        ] {
            XCTAssertThrowsError(try resolver.token(from: URL(string: value)), value)
        }
    }

    func testReadsOnceWithMimeAndLengthAndReleasesScopedAccess() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).musicxml")
        try Data("<score/>".utf8).write(to: fileURL)
        defer { try? FileManager.default.removeItem(at: fileURL) }
        let access = SecurityScopeSpy()
        let store = FileTokenStore()
        let token = try await store.issue(
            url: fileURL,
            fileName: "score.musicxml",
            sizeBytes: 8
        )
        let service = BinaryDataService(store: store, securityScope: access)

        let response = try await service.read(URL(string: "zupulse-data://file/\(token)")!)

        XCTAssertEqual(response.mimeType, "application/vnd.recordare.musicxml+xml")
        XCTAssertEqual(response.expectedContentLength, 8)
        XCTAssertEqual(response.data, Data("<score/>".utf8))
        XCTAssertEqual(access.startCount, 1)
        XCTAssertEqual(access.stopCount, 1)
        await XCTAssertThrowsErrorAsync(
            try await service.read(URL(string: "zupulse-data://file/\(token)")!),
            code: "FILE_TOKEN_INVALID"
        )
    }

    func testRejectsAFileThatGrowsBeyondTheLimitAndStillReleasesAccess() async throws {
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([1, 2, 3, 4, 5]).write(to: fileURL)
        defer { try? FileManager.default.removeItem(at: fileURL) }
        let access = SecurityScopeSpy()
        let store = FileTokenStore(maxBytes: 4)
        let token = try await store.issue(url: fileURL, fileName: "score.gp", sizeBytes: 4)
        let service = BinaryDataService(store: store, securityScope: access, maxBytes: 4)

        await XCTAssertThrowsErrorAsync(
            try await service.read(URL(string: "zupulse-data://file/\(token)")!),
            code: "FILE_TOO_LARGE"
        )
        XCTAssertEqual(access.stopCount, 1)
    }

    func testCancellationReleasesScopedAccess() async throws {
        let access = SecurityScopeSpy()
        let started = expectation(description: "read started")
        let store = FileTokenStore()
        let token = try await store.issue(
            url: URL(fileURLWithPath: "/private/slow.gp"),
            fileName: "slow.gp",
            sizeBytes: 1
        )
        let service = BinaryDataService(
            store: store,
            securityScope: access,
            readData: { _ in
                started.fulfill()
                Thread.sleep(forTimeInterval: 0.1)
                return Data([1])
            }
        )
        let read = Task { try await service.read(URL(string: "zupulse-data://file/\(token)")!) }
        await fulfillment(of: [started])

        read.cancel()
        do {
            _ = try await read.value
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            XCTAssertEqual(access.stopCount, 1)
        }
    }
}

@MainActor
private final class NavigationSpy: NSObject, WKNavigationDelegate {
    var onFinish: (() -> Void)?

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onFinish?()
    }
}

private final class SecurityScopeSpy: SecurityScopedAccessing, @unchecked Sendable {
    private(set) var startCount = 0
    private(set) var stopCount = 0

    func startAccessing(_ url: URL) -> @Sendable () -> Void {
        startCount += 1
        return { [weak self] in self?.stopCount += 1 }
    }
}
