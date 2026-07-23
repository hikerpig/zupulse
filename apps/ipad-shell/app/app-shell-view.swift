import SwiftUI

#if DEBUG
@MainActor
final class UITestImportStage: ObservableObject {
    static let shared = UITestImportStage()
    @Published var value = "IDLE"
}
#endif

struct AppShellView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var suspendGeneration = 0

    private let webEntryURL = Bundle.main.url(
        forResource: "index",
        withExtension: "html",
        subdirectory: "Web"
    )

    var body: some View {
        ZStack {
            if let webEntryURL {
                WebViewContainer(
                    entryURL: webEntryURL,
                    suspendGeneration: suspendGeneration
                )
                    .ignoresSafeArea()
            } else {
                ContentUnavailableView(
                    "无法启动逐拍",
                    systemImage: "exclamationmark.triangle",
                    description: Text("应用内的 Web 资源缺失，请重新构建。")
                )
            }
            #if DEBUG
            if ProcessInfo.processInfo.environment["ZUPULSE_UI_TEST_FIXTURE"] != nil {
                UITestImportStageView()
            }
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .inactive || phase == .background else { return }
            suspendGeneration += 1
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .zupulseAudioPauseIntent)
        ) { _ in
            suspendGeneration += 1
        }
    }
}

#if DEBUG
private struct UITestImportStageView: View {
    @ObservedObject private var stage = UITestImportStage.shared

    var body: some View {
        Text(stage.value)
            .font(.system(size: 1))
            .opacity(0.01)
            .accessibilityIdentifier("zupulse-ui-test-stage")
    }
}
#endif
