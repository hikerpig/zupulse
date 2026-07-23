import SwiftUI

@main
struct ZupulseApp: App {
    private let audioSessionController: AudioSessionController
    private let externalOpenQueue: ExternalOpenQueue

    init() {
        let notificationCenter = NotificationCenter.default
        let controller = AudioSessionController { intent in
            notificationCenter.post(
                name: .zupulseAudioPauseIntent,
                object: nil,
                userInfo: ["reason": intent.rawValue]
            )
        }
        try? controller.configureForPlayback()
        audioSessionController = controller
        externalOpenQueue = ExternalOpenQueue()
    }

    var body: some Scene {
        WindowGroup {
            AppShellView(externalOpenQueue: externalOpenQueue)
        }
    }
}
