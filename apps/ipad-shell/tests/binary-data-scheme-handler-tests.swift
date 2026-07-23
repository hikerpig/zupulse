import Foundation
import XCTest
@testable import Zupulse

final class BinarySchemeTests: XCTestCase {
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

private final class SecurityScopeSpy: SecurityScopedAccessing, @unchecked Sendable {
    private(set) var startCount = 0
    private(set) var stopCount = 0

    func startAccessing(_ url: URL) -> @Sendable () -> Void {
        startCount += 1
        return { [weak self] in self?.stopCount += 1 }
    }
}
