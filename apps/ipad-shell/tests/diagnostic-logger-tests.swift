import XCTest
@testable import Zupulse

final class DiagnosticsTests: XCTestCase {
    func testRotatesBoundedStructuredLogsAndExportsWithoutMutation() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let logger = DiagnosticLogger(
            directory: directory,
            maximumBytes: 100,
            maximumFiles: 2,
            timestamp: { "2026-07-24T00:00:00Z" }
        )
        for index in 0..<8 {
            logger.record(
                code: "IMPORT_\(index)",
                durationMs: Double(index),
                contentHashPrefix: "abcdef12"
            )
        }
        let before = logger.exportData()
        let after = logger.exportData()
        XCTAssertEqual(before, after)
        XCTAssertFalse(before.isEmpty)
        XCTAssertLessThanOrEqual(
            try FileManager.default.contentsOfDirectory(atPath: directory.path).count,
            2
        )
        let text = String(decoding: before, as: UTF8.self)
        XCTAssertFalse(text.contains("path"))
        XCTAssertFalse(text.contains("token"))
        XCTAssertFalse(text.contains("fileName"))
        XCTAssertFalse(text.contains("metadata"))
        XCTAssertFalse(text.contains("payload"))
    }

    func testSwiftValidatorRejectsSensitiveAndArbitraryFields() throws {
        let validator = BridgeContractValidator()
        for field in ["path", "token", "fileName", "metadata", "payload", "message"] {
            let request = diagnosticsRequest(extra: [field: "secret"])
            guard case .failure = validator.validate(try JSONSerialization.data(withJSONObject: request)) else {
                return XCTFail("Expected \(field) to be rejected")
            }
        }
    }

    func testBridgeRoutesValidatedDiagnosticsToTheLocalLogger() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let logger = DiagnosticLogger(directory: directory)
        let router = BridgeRouter(
            appVersion: "0.1.0",
            rendererBuildHash: "build",
            diagnosticLogger: logger
        )
        let request = diagnosticsRequest(extra: [:])
        guard case .success = router.handle(request) else {
            return XCTFail("Expected diagnostics.write to succeed")
        }
        XCTAssertTrue(
            String(decoding: logger.exportData(), as: UTF8.self)
                .contains("IMPORT_COMPLETE")
        )
    }

    private func diagnosticsRequest(extra: [String: Any]) -> [String: Any] {
        var payload: [String: Any] = [
            "code": "IMPORT_COMPLETE",
            "durationMs": 12,
            "contentHashPrefix": "abcdef12",
        ]
        payload.merge(extra) { _, replacement in replacement }
        return [
            "bridgeVersion": "3.0.0",
            "correlationId": UUID().uuidString,
            "type": "diagnostics.write",
            "payload": payload,
        ]
    }
}
