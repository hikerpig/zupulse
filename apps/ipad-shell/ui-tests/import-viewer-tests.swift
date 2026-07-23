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
        app.launchEnvironment = [
            "ZUPULSE_UI_TEST_FIXTURE": "desktop-acceptance.gp",
            "ZUPULSE_UI_TEST_RESET_SCORE_ZOOM": "1",
        ]
        app.launch()
        XCTAssertTrue(app.staticTexts["曲谱库"].waitForExistence(timeout: 30), stage("gp-library"))
        waitForViewer(in: app, stage: "gp-import")
    }

    func testScoreZoomButtonsAndPinchCommit() {
        let app = XCUIApplication()
        app.launchEnvironment = ["ZUPULSE_UI_TEST_FIXTURE": "single-voice.musicxml"]
        app.launch()

        let zoomOut = app.buttons["缩小谱面"]
        XCTAssertTrue(app.buttons["放大谱面"].waitForExistence(timeout: 60), stage("zoom-controls"))
        for _ in 0..<20 where zoomOut.isEnabled {
            zoomOut.tap()
        }
        XCTAssertTrue(zoomStatus(in: app, percent: 75).exists, stage("zoom-minimum"))
        app.buttons["放大谱面"].tap()
        XCTAssertTrue(
            zoomStatus(in: app, percent: 85).waitForExistence(timeout: 5),
            stage("zoom-button-commit")
        )

        let scoreWorkspace = app.otherElements
            .matching(NSPredicate(format: "label BEGINSWITH %@", "乐谱工作区"))
            .firstMatch
        XCTAssertTrue(scoreWorkspace.waitForExistence(timeout: 10), stage("zoom-score-workspace"))
        scoreWorkspace.pinch(withScale: 1.2, velocity: 1)

        let committedZoomStatus = app.otherElements
            .matching(NSPredicate(format: "label BEGINSWITH %@", "谱面缩放 "))
            .firstMatch
        XCTAssertTrue(committedZoomStatus.waitForExistence(timeout: 5), stage("zoom-pinch-status"))
        XCTAssertNotEqual(committedZoomStatus.label, "谱面缩放 85%", stage("zoom-pinch-commit"))
        XCTAssertTrue(app.buttons["播放"].exists, stage("zoom-keeps-transport"))
        XCTAssertTrue(app.links["曲谱库"].exists, stage("zoom-keeps-library-route"))

        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "score-zoom-pinch-commit"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testScrollAndPinchDoNotSeekOrInterruptPlayback() {
        let app = XCUIApplication()
        app.launchEnvironment = [
            "ZUPULSE_UI_TEST_FIXTURE": "desktop-acceptance.gp",
            "ZUPULSE_UI_TEST_EPHEMERAL_STORAGE": "1",
            "ZUPULSE_UI_TEST_RESET_SCORE_ZOOM": "1",
        ]
        app.launch()

        let scorePreview = app.otherElements
            .matching(NSPredicate(format: "label BEGINSWITH %@", "乐谱预览"))
            .firstMatch
        let scoreWorkspace = app.otherElements
            .matching(NSPredicate(format: "label BEGINSWITH %@", "乐谱工作区"))
            .firstMatch
        let progress = app.sliders["播放进度"]
        XCTAssertTrue(scorePreview.waitForExistence(timeout: 60), stage("tap-score-preview"))
        XCTAssertTrue(scoreWorkspace.exists, stage("tap-score-workspace"))
        XCTAssertTrue(progress.exists, stage("tap-progress"))
        app.buttons["停止"].tap()
        let stoppedValue = progress.value as? String

        scoreWorkspace.swipeUp()
        XCTAssertEqual(progress.value as? String, stoppedValue, stage("scroll-does-not-seek"))
        scoreWorkspace.pinch(withScale: 0.9, velocity: -1)
        XCTAssertEqual(progress.value as? String, stoppedValue, stage("pinch-does-not-seek"))

        app.buttons["播放"].tap()
        XCTAssertTrue(app.buttons["暂停"].waitForExistence(timeout: 5), stage("tap-playing"))
        scoreWorkspace.coordinate(withNormalizedOffset: CGVector(dx: 0.74, dy: 0.75)).tap()
        XCTAssertTrue(app.buttons["暂停"].exists, stage("tap-keeps-playing"))

        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "score-tap-scroll-pinch-arbitration"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    private func zoomStatus(in app: XCUIApplication, percent: Int) -> XCUIElement {
        app.otherElements
            .matching(NSPredicate(format: "label BEGINSWITH %@", "谱面缩放 \(percent)%"))
            .firstMatch
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

final class BatchImportTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testReportsCreatedExistingAndFailedItemsWhileStayingInLibrary() {
        let app = XCUIApplication()
        app.launchEnvironment = [
            "ZUPULSE_UI_TEST_FIXTURES":
                "single-voice.musicxml,single-voice.musicxml,broken.mxl",
            "ZUPULSE_UI_TEST_EPHEMERAL_STORAGE": "1",
            "ZUPULSE_UI_TEST_START_LIBRARY": "1",
        ]
        app.launch()

        XCTAssertTrue(app.staticTexts["导入完成"].waitForExistence(timeout: 60))
        let summary = app.otherElements
            .matching(NSPredicate(format: "label BEGINSWITH %@", "导入汇总："))
            .firstMatch
        XCTAssertTrue(summary.exists)
        XCTAssertTrue(summary.label.contains("新增 1，已存在 1，失败 1，未开始 0"))
        XCTAssertTrue(staticText(containing: "broken.mxl", in: app).exists)
        XCTAssertTrue(staticText(containing: "failed · INVALID_SCORE", in: app).exists)
        XCTAssertTrue(app.buttons["批量导入"].exists)
    }

    private func staticText(containing value: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", value)).firstMatch
    }
}
