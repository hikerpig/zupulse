import XCTest
@testable import Zupulse

@MainActor
final class LifecycleCoordinatorTests: XCTestCase {
    func testKeepsOnlyOnePendingAckForTheSameState() {
        let scheduler = LifecycleTimeoutSchedulerSpy()
        var events: [LifecycleEventEnvelope] = []
        let coordinator = LifecycleCoordinator(
            scheduleTimeout: scheduler.schedule,
            emit: { events.append($0) },
            diagnose: { _ in }
        )

        coordinator.request(.suspend)
        coordinator.request(.suspend)

        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].type, "app.lifecycle")
        XCTAssertEqual(events[0].state, .suspend)
        XCTAssertEqual(coordinator.pendingStates, [.suspend])
    }

    func testAcknowledgementClearsPendingAndLateAckIsIdempotent() {
        let scheduler = LifecycleTimeoutSchedulerSpy()
        let coordinator = LifecycleCoordinator(
            scheduleTimeout: scheduler.schedule,
            emit: { _ in },
            diagnose: { _ in }
        )
        coordinator.request(.prepareClose)

        XCTAssertTrue(coordinator.acknowledge(.prepareClose))
        XCTAssertFalse(coordinator.acknowledge(.prepareClose))
        XCTAssertTrue(coordinator.pendingStates.isEmpty)
        XCTAssertEqual(scheduler.cancelCount, 1)
    }

    func testTimeoutClearsPendingAndEmitsOnlyStableDiagnostic() {
        let scheduler = LifecycleTimeoutSchedulerSpy()
        var diagnostics: [String] = []
        var events: [LifecycleEventEnvelope] = []
        let coordinator = LifecycleCoordinator(
            scheduleTimeout: scheduler.schedule,
            emit: { events.append($0) },
            diagnose: { diagnostics.append($0) }
        )
        coordinator.request(.suspend)

        scheduler.fireAll()

        XCTAssertEqual(events.map(\.state), [.suspend])
        XCTAssertEqual(diagnostics, ["LIFECYCLE_ACK_TIMEOUT"])
        XCTAssertTrue(coordinator.pendingStates.isEmpty)
    }

    func testBridgeAcknowledgementClearsPendingAndRepeatedAckStillSucceeds() {
        let scheduler = LifecycleTimeoutSchedulerSpy()
        let coordinator = LifecycleCoordinator(
            scheduleTimeout: scheduler.schedule,
            emit: { _ in },
            diagnose: { _ in }
        )
        let router = BridgeRouter(
            appVersion: "0.1.0",
            rendererBuildHash: "fixture-build",
            lifecycleCoordinator: coordinator
        )
        coordinator.request(.suspend)

        for correlationId in ["ack-1", "ack-2"] {
            let result = router.handle([
                "bridgeVersion": "3.0.0",
                "correlationId": correlationId,
                "type": "app.lifecycleAck",
                "payload": ["state": "suspend"],
            ])
            guard case let .success(response) = result else {
                return XCTFail("Expected lifecycle acknowledgement")
            }
            XCTAssertEqual(response["type"] as? String, "app.lifecycleAck")
        }

        XCTAssertTrue(coordinator.pendingStates.isEmpty)
    }

    func testBundledPageAcknowledgesSuspendAfterWebPauseAndFlush() async throws {
        let entryURL = try XCTUnwrap(
            Bundle.main.url(
                forResource: "index",
                withExtension: "html",
                subdirectory: "Web"
            )
        )
        let webViewCoordinator = WebViewContainer.Coordinator(entryURL: entryURL)
        try await Task.sleep(for: .seconds(3))

        webViewCoordinator.lifecycleCoordinator.request(.suspend)
        for _ in 0..<50 where !webViewCoordinator.lifecycleCoordinator.pendingStates.isEmpty {
            try await Task.sleep(for: .milliseconds(100))
        }

        XCTAssertTrue(webViewCoordinator.lifecycleCoordinator.pendingStates.isEmpty)
    }
}

@MainActor
private final class LifecycleTimeoutSchedulerSpy {
    private var actions: [() -> Void] = []
    private(set) var cancelCount = 0

    func schedule(_ action: @escaping () -> Void) -> () -> Void {
        actions.append(action)
        return { [weak self] in self?.cancelCount += 1 }
    }

    func fireAll() {
        let pending = actions
        actions.removeAll()
        pending.forEach { $0() }
    }
}
