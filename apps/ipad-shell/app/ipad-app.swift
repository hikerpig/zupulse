import SwiftUI

@main
struct ZupulseApp: App {
    private let audioSessionController: AudioSessionController
    private let externalOpenQueue: ExternalOpenQueue
    private let diagnosticLogger: DiagnosticLogger

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
        let support = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.temporaryDirectory
        diagnosticLogger = DiagnosticLogger(
            directory: support.appendingPathComponent("Diagnostics", isDirectory: true)
        )
    }

    var body: some Scene {
        WindowGroup {
            AppShellView(
                externalOpenQueue: externalOpenQueue,
                diagnosticLogger: diagnosticLogger
            )
        }
    }
}
