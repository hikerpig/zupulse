import AVFAudio
import Foundation

enum AudioPauseIntent: String, Equatable {
    case interruptionBegan = "interruption-began"
    case oldDeviceUnavailable = "old-device-unavailable"
    case noSuitableRoute = "no-suitable-route"
}

extension Notification.Name {
    static let zupulseAudioPauseIntent = Notification.Name(
        "com.hikerpig.zupulse.audio-pause-intent"
    )
}

protocol AudioSessionConfiguring: AnyObject {
    var notificationObject: AnyObject { get }

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws

    func setActive(_ active: Bool) throws
}

final class SystemAudioSession: AudioSessionConfiguring {
    private let session: AVAudioSession

    init(session: AVAudioSession = .sharedInstance()) {
        self.session = session
    }

    var notificationObject: AnyObject {
        session
    }

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        try session.setCategory(category, mode: mode, options: options)
    }

    func setActive(_ active: Bool) throws {
        try session.setActive(active)
    }
}

@MainActor
final class AudioSessionController: NSObject {
    private let session: AudioSessionConfiguring
    private let notificationCenter: NotificationCenter
    private let onPauseIntent: (AudioPauseIntent) -> Void

    init(
        session: AudioSessionConfiguring = SystemAudioSession(),
        notificationCenter: NotificationCenter = .default,
        onPauseIntent: @escaping (AudioPauseIntent) -> Void
    ) {
        self.session = session
        self.notificationCenter = notificationCenter
        self.onPauseIntent = onPauseIntent
        super.init()
        notificationCenter.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: session.notificationObject
        )
        notificationCenter.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: session.notificationObject
        )
    }

    deinit {
        notificationCenter.removeObserver(self)
    }

    func configureForPlayback() throws {
        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
    }

    func activateForPlayback() throws {
        try configureForPlayback()
        try session.setActive(true)
    }

    @objc
    private func handleInterruption(_ notification: Notification) {
        guard
            let rawValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: rawValue) == .began
        else {
            return
        }
        onPauseIntent(.interruptionBegan)
    }

    @objc
    private func handleRouteChange(_ notification: Notification) {
        guard
            let rawValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: rawValue)
        else {
            return
        }
        switch reason {
        case .oldDeviceUnavailable:
            onPauseIntent(.oldDeviceUnavailable)
        case .noSuitableRouteForCategory:
            onPauseIntent(.noSuitableRoute)
        default:
            break
        }
    }
}
