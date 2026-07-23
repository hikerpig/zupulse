import Foundation
import XCTest
@testable import Zupulse

final class DocumentPickerRouteTests: XCTestCase {
    @MainActor
    func testBundledFixturePickerUsesOnlyAnExplicitResourceName() async throws {
        let picker = try XCTUnwrap(
            bundledFixtureDocumentPicker(
                bundle: .main,
                environment: ["ZUPULSE_UI_TEST_FIXTURE": "desktop-acceptance.gp"]
            )
        )

        let urls = try await picker.select(multiple: false)

        XCTAssertEqual(urls?.first?.lastPathComponent, "desktop-acceptance.gp")
    }

    @MainActor
    func testBundledFixturePickerSupportsExplicitMultipleResources() async throws {
        let picker = try XCTUnwrap(
            bundledFixtureDocumentPicker(
                bundle: .main,
                environment: [
                    "ZUPULSE_UI_TEST_FIXTURES": "single-voice.musicxml,desktop-acceptance.gp"
                ]
            )
        )

        let urls = try await picker.select(multiple: true)

        XCTAssertEqual(
            urls?.map(\.lastPathComponent),
            ["single-voice.musicxml", "desktop-acceptance.gp"]
        )
    }

    func testCancellationReturnsNoFilesAndIssuesNoToken() async throws {
        let tokens = FileTokenStore()
        let router = BridgeRouter(
            appVersion: "0.1.0",
            rendererBuildHash: "fixture",
            fileSelector: PickerStub(result: nil),
            fileTokens: tokens
        )

        guard case let .success(response) = await router.handleFileRequest(selectRequest("cancel")) else {
            return XCTFail("Expected cancellation response")
        }

        XCTAssertEqual((response["payload"] as? [String: Any])?["status"] as? String, "cancelled")
        let tokenCount = await tokens.outstandingCount
        XCTAssertEqual(tokenCount, 0)
    }

    func testSelectionReturnsOnlyMetadataAndOneTimeToken() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).musicxml")
        try Data([1, 2, 3]).write(to: fileURL)
        defer { try? FileManager.default.removeItem(at: fileURL) }
        let tokens = FileTokenStore()
        let router = BridgeRouter(
            appVersion: "0.1.0",
            rendererBuildHash: "fixture",
            fileSelector: PickerStub(result: [fileURL]),
            fileTokens: tokens
        )

        guard case let .success(response) = await router.handleFileRequest(selectRequest("selected")) else {
            return XCTFail("Expected selected response")
        }
        let payload = try XCTUnwrap(response["payload"] as? [String: Any])
        let files = try XCTUnwrap(payload["files"] as? [[String: Any]])
        XCTAssertEqual(payload["status"] as? String, "selected")
        XCTAssertEqual(files.first?["fileName"] as? String, fileURL.lastPathComponent)
        XCTAssertEqual(files.first?["sizeBytes"] as? Int, 3)
        XCTAssertNotNil(files.first?["fileToken"] as? String)
        let json = String(data: try JSONSerialization.data(withJSONObject: response), encoding: .utf8)!
        XCTAssertFalse(json.contains(FileManager.default.temporaryDirectory.path))
        let tokenCount = await tokens.outstandingCount
        XCTAssertEqual(tokenCount, 1)
    }

    func testRejectsUnsupportedNonRegularAndOversizedSelections() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let unsupported = root.appendingPathComponent("score.exe")
        try Data([1]).write(to: unsupported)
        let oversized = root.appendingPathComponent("score.gp")
        FileManager.default.createFile(atPath: oversized.path, contents: nil)
        let handle = try FileHandle(forWritingTo: oversized)
        try handle.truncate(atOffset: UInt64(maximumScoreFileBytes + 1))
        try handle.close()
        let missing = root.appendingPathComponent("missing.musicxml")

        let invalidSelections = [
            (unsupported, "FILE_TYPE_UNSUPPORTED"),
            (root, "FILE_SELECTION_INVALID"),
            (oversized, "FILE_TOO_LARGE"),
            (missing, "FILE_SELECTION_INVALID"),
        ]
        for (index, selection) in invalidSelections.enumerated() {
            let router = BridgeRouter(
                appVersion: "0.1.0",
                rendererBuildHash: "fixture",
                fileSelector: PickerStub(result: [selection.0]),
                fileTokens: FileTokenStore()
            )
            guard case let .failure(error) = await router.handleFileRequest(
                selectRequest("invalid-\(index)")
            ) else {
                return XCTFail("Expected invalid selection")
            }
            XCTAssertEqual(error.code, selection.1)
            XCTAssertFalse(error.code.contains(root.path))
            XCTAssertFalse(error.message.contains(root.path))
        }
    }

    private func selectRequest(_ correlationId: String) -> [String: Any] {
        [
            "bridgeVersion": "3.0.0",
            "correlationId": correlationId,
            "type": "file.select",
            "payload": ["multiple": false],
        ]
    }
}

private struct PickerStub: DocumentPicking {
    let result: [URL]?

    @MainActor
    func select(multiple: Bool) async throws -> [URL]? {
        result
    }
}
