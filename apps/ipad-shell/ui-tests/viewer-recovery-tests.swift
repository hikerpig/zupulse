import XCTest

final class ViewerRecoveryTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testRestoresViewerPausedAfterColdLaunchAndWebContentReplacement() {
        let app = XCUIApplication()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_FIXTURE": "single-voice.musicxml"]
        app.launch()
        XCTAssertTrue(app.links["查看器"].waitForExistence(timeout: 60))

        app.terminate()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_RECOVER_WEB_CONTENT": "1"]
        app.launch()

        let stage = app.staticTexts["zupulse-ui-test-stage"]
        let recovered = NSPredicate(format: "label == %@", "WEB_CONTENT_RECOVERED")
        expectation(for: recovered, evaluatedWith: stage)
        waitForExpectations(timeout: 60)

        XCTAssertTrue(app.links["查看器"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["播放"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["暂停"].exists)
    }
}
