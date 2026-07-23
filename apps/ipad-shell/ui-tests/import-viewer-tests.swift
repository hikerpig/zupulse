import XCTest

final class ImportViewerTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testImportsFixturesPersistsAndDeduplicates() throws {
        let app = XCUIApplication()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_FIXTURE": "single-voice.musicxml"]
        app.launch()

        waitForViewer(in: app, stage: "musicxml-first-import")
        relaunchLibrary(in: app)
        assertSingleImportedScore(in: app, stage: "musicxml-library-count")

        app.terminate()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_FIXTURE": "single-voice.musicxml"]
        app.launch()
        waitForViewer(in: app, stage: "musicxml-duplicate-import")
        relaunchLibrary(in: app)
        assertSingleImportedScore(in: app, stage: "musicxml-deduplicated")

        app.terminate()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_OPEN_FIRST": "1"]
        app.launch()
        waitForViewer(in: app, stage: "relaunch-open-viewer")

        app.terminate()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_FIXTURE": "desktop-acceptance.gp"]
        app.launch()
        XCTAssertTrue(app.staticTexts["曲谱库"].waitForExistence(timeout: 30), stage("gp-library"))
        waitForViewer(in: app, stage: "gp-import")
    }

    private func waitForViewer(in app: XCUIApplication, stage: String) {
        guard app.links["查看器"].waitForExistence(timeout: 60) else {
            let importError = app.staticTexts
                .matching(NSPredicate(format: "label BEGINSWITH %@", "IMPORT_"))
                .firstMatch
            let errorCode = importError.exists ? importError.label : "IMPORT_NO_RESULT"
            let nativeStageElement = app.staticTexts["zupulse-ui-test-stage"]
            let nativeStage = nativeStageElement.exists ? nativeStageElement.label : "UNAVAILABLE"
            XCTFail("\(self.stage("\(stage)-viewer")):\(errorCode):NATIVE_\(nativeStage)")
            return
        }
        XCTAssertFalse(app.staticTexts["未打开乐谱"].exists, self.stage("\(stage)-score-ready"))
    }

    private func relaunchLibrary(in app: XCUIApplication) {
        app.terminate()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_START_LIBRARY": "1"]
        app.launch()
        XCTAssertTrue(app.buttons["批量导入"].waitForExistence(timeout: 30), stage("relaunch-library"))
    }

    private func assertSingleImportedScore(in app: XCUIApplication, stage: String) {
        let entries = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "MUSICXML", "Single")
        )
        XCTAssertTrue(entries.firstMatch.waitForExistence(timeout: 10), self.stage("\(stage)-visible"))
        XCTAssertEqual(entries.count, 1, self.stage(stage))
    }

    private func stage(_ value: String) -> String {
        "IPAD_IMPORT_SMOKE_STAGE:\(value)"
    }
}
