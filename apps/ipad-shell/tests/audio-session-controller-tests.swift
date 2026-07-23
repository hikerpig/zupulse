import AVFAudio
import UIKit
import XCTest
@testable import Zupulse

@MainActor
final class AudioSessionTests: XCTestCase {
    func testConfigurationDoesNotActivateAndAppHasNoBackgroundAudioMode() throws {
        let session = AudioSessionSpy()
        let controller = AudioSessionController(
            session: session,
            notificationCenter: NotificationCenter()
        ) { _ in }

        try controller.configureForPlayback()

        XCTAssertEqual(session.categoryConfigurations.count, 1)
        XCTAssertTrue(session.activationRequests.isEmpty)
        XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes"))
    }

    func testActivatesOnlyOnExplicitPlaybackWithMixingAndNoDucking() throws {
        let session = AudioSessionSpy()
        let controller = AudioSessionController(
            session: session,
            notificationCenter: NotificationCenter()
        ) { _ in }

        XCTAssertTrue(session.categoryConfigurations.isEmpty)
        XCTAssertTrue(session.activationRequests.isEmpty)

        try controller.activateForPlayback()

        XCTAssertEqual(session.categoryConfigurations.count, 1)
        XCTAssertEqual(session.categoryConfigurations[0].category, .playback)
        XCTAssertEqual(session.categoryConfigurations[0].mode, .default)
        XCTAssertEqual(session.categoryConfigurations[0].options, [.mixWithOthers])
        XCTAssertFalse(session.categoryConfigurations[0].options.contains(.duckOthers))
        XCTAssertEqual(session.activationRequests, [true])
    }

    func testInterruptionBeginAndUnavailableRoutesProducePauseIntents() {
        let notifications = NotificationCenter()
        let session = AudioSessionSpy()
        var intents: [AudioPauseIntent] = []
        let controller = AudioSessionController(
            session: session,
            notificationCenter: notifications
        ) { intents.append($0) }

        notifications.post(
            name: AVAudioSession.interruptionNotification,
            object: session.notificationObject,
            userInfo: [
                AVAudioSessionInterruptionTypeKey:
                    AVAudioSession.InterruptionType.began.rawValue
            ]
        )
        notifications.post(
            name: AVAudioSession.routeChangeNotification,
            object: session.notificationObject,
            userInfo: [
                AVAudioSessionRouteChangeReasonKey:
                    AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
            ]
        )
        notifications.post(
            name: AVAudioSession.routeChangeNotification,
            object: session.notificationObject,
            userInfo: [
                AVAudioSessionRouteChangeReasonKey:
                    AVAudioSession.RouteChangeReason.noSuitableRouteForCategory.rawValue
            ]
        )

        XCTAssertEqual(
            intents,
            [.interruptionBegan, .oldDeviceUnavailable, .noSuitableRoute]
        )
        withExtendedLifetime(controller) {}
    }

    func testInterruptionEndForegroundAndAvailableRouteNeverProducePlayIntent() {
        let notifications = NotificationCenter()
        let session = AudioSessionSpy()
        var intents: [AudioPauseIntent] = []
        let controller = AudioSessionController(
            session: session,
            notificationCenter: notifications
        ) { intents.append($0) }

        notifications.post(
            name: AVAudioSession.interruptionNotification,
            object: session.notificationObject,
            userInfo: [
                AVAudioSessionInterruptionTypeKey:
                    AVAudioSession.InterruptionType.ended.rawValue
            ]
        )
        notifications.post(
            name: AVAudioSession.routeChangeNotification,
            object: session.notificationObject,
            userInfo: [
                AVAudioSessionRouteChangeReasonKey:
                    AVAudioSession.RouteChangeReason.newDeviceAvailable.rawValue
            ]
        )
        notifications.post(name: UIApplication.didBecomeActiveNotification, object: nil)

        XCTAssertTrue(intents.isEmpty)
        withExtendedLifetime(controller) {}
    }
}

private final class AudioSessionSpy: AudioSessionConfiguring {
    struct CategoryConfiguration {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let options: AVAudioSession.CategoryOptions
    }

    let notificationObject: AnyObject = NSObject()
    private(set) var categoryConfigurations: [CategoryConfiguration] = []
    private(set) var activationRequests: [Bool] = []

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        categoryConfigurations.append(
            CategoryConfiguration(category: category, mode: mode, options: options)
        )
    }

    func setActive(_ active: Bool) throws {
        activationRequests.append(active)
    }
}
