import SwiftUI

#if DEBUG
@MainActor
final class UITestImportStage: ObservableObject {
    static let shared = UITestImportStage()
    @Published var value = "IDLE"
}
#endif

struct AppShellView: View {
    private let webEntryURL = Bundle.main.url(
        forResource: "index",
        withExtension: "html",
        subdirectory: "Web"
    )

    var body: some View {
        ZStack {
            if let webEntryURL {
                WebViewContainer(entryURL: webEntryURL)
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
