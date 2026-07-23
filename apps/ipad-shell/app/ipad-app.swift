import SwiftUI

@main
struct ZupulseApp: App {
    private let audioSessionController: AudioSessionController

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
    }

    var body: some Scene {
        WindowGroup {
            AppShellView()
        }
    }
}
