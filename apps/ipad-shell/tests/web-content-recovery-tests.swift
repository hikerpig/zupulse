import XCTest
@testable import Zupulse

@MainActor
final class WebContentRecoveryTests: XCTestCase {
    func testReplacesEachActiveContentInstanceExactlyOnce() {
        let initial = RecoveryContent()
        var installed: [RecoveryContent] = []
        let coordinator = WebContentRecoveryCoordinator(
            initialContent: initial,
            makeReplacement: RecoveryContent.init,
            install: { installed.append($0) }
        )

        coordinator.contentProcessDidTerminate(initial)
        coordinator.contentProcessDidTerminate(initial)

        XCTAssertEqual(coordinator.replacementCount, 1)
        XCTAssertEqual(installed.count, 1)
        XCTAssertTrue(coordinator.activeContent === installed[0])
    }

    func testAReplacementCanRecoverOnceFromItsOwnLaterTermination() {
        let initial = RecoveryContent()
        let coordinator = WebContentRecoveryCoordinator(
            initialContent: initial,
            makeReplacement: RecoveryContent.init,
            install: { _ in }
        )
        coordinator.contentProcessDidTerminate(initial)
        let firstReplacement = coordinator.activeContent

        coordinator.contentProcessDidTerminate(firstReplacement)

        XCTAssertEqual(coordinator.replacementCount, 2)
        XCTAssertFalse(coordinator.activeContent === firstReplacement)
    }
}

private final class RecoveryContent {}
