import Foundation
import XCTest
@testable import Zupulse

final class FileTokenTests: XCTestCase {
    func testConsumesExactlyOnceAndClearsOutstandingTokens() async throws {
        let store = FileTokenStore()
        let token = try await store.issue(
            url: URL(fileURLWithPath: "/private/song.gp"),
            fileName: "song.gp",
            sizeBytes: 3
        )

        let entry = try await store.consume(token)
        XCTAssertEqual(entry.fileName, "song.gp")
        await XCTAssertThrowsErrorAsync(try await store.consume(token), code: "FILE_TOKEN_INVALID")

        _ = try await store.issue(
            url: URL(fileURLWithPath: "/private/other.gp"),
            fileName: "other.gp",
            sizeBytes: 2
        )
        await store.clear()
        let count = await store.outstandingCount
        XCTAssertEqual(count, 0)
    }

    func testRejectsOversizedAndExpiredEntriesWithoutLeakingPaths() async throws {
        let clock = TestClock()
        let store = FileTokenStore(maxBytes: 4, ttl: 1, now: { clock.now })
        await XCTAssertThrowsErrorAsync(
            try await store.issue(
                url: URL(fileURLWithPath: "/private/oversized.gp"),
                fileName: "oversized.gp",
                sizeBytes: 5
            ),
            code: "FILE_TOO_LARGE"
        )
        let token = try await store.issue(
            url: URL(fileURLWithPath: "/private/secret.gp"),
            fileName: "secret.gp",
            sizeBytes: 4
        )
        clock.now = clock.now.addingTimeInterval(2)

        do {
            _ = try await store.consume(token)
            XCTFail("Expected expiry")
        } catch {
            XCTAssertEqual((error as NSError).localizedDescription, "FILE_TOKEN_EXPIRED")
            XCTAssertFalse((error as NSError).localizedDescription.contains("/private"))
        }
    }

    func testConcurrentConsumptionHasExactlyOneWinner() async throws {
        let store = FileTokenStore()
        let token = try await store.issue(
            url: URL(fileURLWithPath: "/private/song.musicxml"),
            fileName: "song.musicxml",
            sizeBytes: 3
        )

        let successes = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for _ in 0..<20 {
                group.addTask {
                    do {
                        _ = try await store.consume(token)
                        return true
                    } catch {
                        return false
                    }
                }
            }
            var count = 0
            for await success in group where success { count += 1 }
            return count
        }

        XCTAssertEqual(successes, 1)
    }

    @MainActor
    func testShellDestroyClearsOutstandingTokens() async throws {
        let entryURL = try XCTUnwrap(
            Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web")
        )
        var coordinator: WebViewContainer.Coordinator? = WebViewContainer.Coordinator(entryURL: entryURL)
        let store = try XCTUnwrap(coordinator?.fileTokens)
        _ = try await store.issue(
            url: URL(fileURLWithPath: "/private/pending.gp"),
            fileName: "pending.gp",
            sizeBytes: 1
        )

        coordinator = nil
        try await Task.sleep(for: .milliseconds(100))

        let count = await store.outstandingCount
        XCTAssertEqual(count, 0)
    }
}

private final class TestClock: @unchecked Sendable {
    var now = Date(timeIntervalSince1970: 100)
}

func XCTAssertThrowsErrorAsync<T>(
    _ expression: @autoclosure () async throws -> T,
    code: String,
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        _ = try await expression()
        XCTFail("Expected \(code)", file: file, line: line)
    } catch {
        XCTAssertEqual((error as NSError).localizedDescription, code, file: file, line: line)
    }
}
