import Foundation
import WebKit
import XCTest
@testable import Zupulse

final class ResourceSchemeTests: XCTestCase {
    private var rootURL: URL!
    private var outsideURL: URL!

    override func setUpWithError() throws {
        let temporaryRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        rootURL = temporaryRoot.appendingPathComponent("Web", isDirectory: true)
        outsideURL = temporaryRoot.appendingPathComponent("outside.js")
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
        try Data("ok".utf8).write(to: rootURL.appendingPathComponent("index.html"))
        try Data("secret".utf8).write(to: outsideURL)
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: rootURL.deletingLastPathComponent())
    }

    func testResolvesOnlyFilesInsideTheConfiguredBundleRoot() throws {
        let resolver = AppResourceResolver(rootURL: rootURL)

        XCTAssertEqual(
            try resolver.resolve(URL(string: "zupulse://app/index.html")),
            rootURL.appendingPathComponent("index.html").resolvingSymlinksInPath()
        )

        let invalidURLs = [
            "zupulse://other/index.html",
            "zupulse://app/",
            "zupulse://app/../outside.js",
            "zupulse://app/%2e%2e/outside.js",
            "zupulse://app/assets%2Fmain.js",
            "zupulse://user@app/index.html",
            "zupulse://app:80/index.html",
            "zupulse://app/index.html?cache=no",
            "zupulse://app/index.html#fragment",
        ]
        for value in invalidURLs {
            XCTAssertThrowsError(try resolver.resolve(URL(string: value)), value)
        }
    }

    func testRejectsSymlinksThatEscapeTheBundleRoot() throws {
        try FileManager.default.createSymbolicLink(
            at: rootURL.appendingPathComponent("escape.js"),
            withDestinationURL: outsideURL
        )
        let resolver = AppResourceResolver(rootURL: rootURL)

        XCTAssertThrowsError(try resolver.resolve(URL(string: "zupulse://app/escape.js")))
    }

    func testReturnsExplicitMimeTypesForBundledResourceKinds() {
        let resolver = AppResourceResolver(rootURL: rootURL)

        XCTAssertEqual(resolver.mimeType(forPathExtension: "html"), "text/html")
        XCTAssertEqual(resolver.mimeType(forPathExtension: "mjs"), "text/javascript")
        XCTAssertEqual(resolver.mimeType(forPathExtension: "woff2"), "font/woff2")
        XCTAssertEqual(resolver.mimeType(forPathExtension: "otf"), "font/otf")
        XCTAssertEqual(resolver.mimeType(forPathExtension: "sf3"), "audio/sf3")
        XCTAssertEqual(resolver.mimeType(forPathExtension: "unknown"), "application/octet-stream")
    }

    @MainActor
    func testBundledOriginRunsCapabilityMatrixAndPersistsIndexedDb() async throws {
        let entryURL = try XCTUnwrap(
            Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web")
        )
        let first = WebViewContainer.Coordinator(entryURL: entryURL)
        let firstResult = try await probeResult(from: first.webView)
        XCTAssertEqual(firstResult["origin"] as? String, "zupulse://app")
        XCTAssertEqual(firstResult["isSecureContext"] as? Bool, true)
        assertSuccessful(firstResult, check: "webCrypto")
        assertSuccessful(firstResult, check: "dynamicImport")
        assertSuccessful(firstResult, check: "worker")
        assertSuccessful(firstResult, check: "audioWorklet")
        assertSuccessful(firstResult, check: "indexedDB")
        assertSuccessful(firstResult, check: "font")
        assertSuccessful(firstResult, check: "soundFont")
        XCTAssertTrue(first.requestedResourcePaths.contains("/probes/resource-origin-worker.mjs"))
        XCTAssertTrue(first.requestedResourcePaths.contains("/probes/resource-origin-worklet.mjs"))
        XCTAssertTrue(first.requestedResourcePaths.contains("/alphatab/font/Bravura.woff2"))
        XCTAssertTrue(first.requestedResourcePaths.contains("/alphatab/soundfont/sonivox.sf3"))
        let applicationReadyMs = try await startupApplicationReadyMs(from: first.webView)
        XCTAssertGreaterThanOrEqual(applicationReadyMs, 0)

        let second = WebViewContainer.Coordinator(entryURL: entryURL)
        let secondResult = try await probeResult(from: second.webView)
        assertSuccessful(secondResult, check: "indexedDB")
        XCTAssertEqual(detail(in: secondResult, check: "indexedDB"), "persisted")
    }

    @MainActor
    private func probeResult(from webView: WKWebView) async throws -> [String: Any] {
        for _ in 0..<50 {
            let available = try await webView.evaluateJavaScript(
                "Boolean(window.__zupulseResourceOriginProbe)"
            ) as? Bool
            if available == true { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        let value = try await webView.callAsyncJavaScript(
            "return await window.__zupulseResourceOriginProbe",
            arguments: [:],
            contentWorld: .page
        )
        return try XCTUnwrap(value as? [String: Any])
    }

    @MainActor
    private func startupApplicationReadyMs(from webView: WKWebView) async throws -> Double {
        for _ in 0..<50 {
            let value = try await webView.evaluateJavaScript(
                "window.__zupulseStartupTiming && window.__zupulseStartupTiming.applicationReadyMs"
            )
            if let applicationReadyMs = value as? Double {
                return applicationReadyMs
            }
            if let applicationReadyMs = value as? Int {
                return Double(applicationReadyMs)
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTFail("startup applicationReadyMs was not published")
        return -1
    }

    private func assertSuccessful(
        _ result: [String: Any],
        check: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(status(in: result, check: check), "success", "\(check): \(detail(in: result, check: check))", file: file, line: line)
    }

    private func status(in result: [String: Any], check: String) -> String? {
        entry(in: result, check: check)?["status"] as? String
    }

    private func detail(in result: [String: Any], check: String) -> String? {
        entry(in: result, check: check)?["detail"] as? String
    }

    private func entry(in result: [String: Any], check: String) -> [String: Any]? {
        (result["checks"] as? [String: Any])?[check] as? [String: Any]
    }
}
