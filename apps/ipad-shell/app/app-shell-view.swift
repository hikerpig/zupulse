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
    @State private var exportDocument: DiagnosticExportDocument?
    @State private var isExportingDiagnostics = false
    let externalOpenQueue: ExternalOpenQueue
    let diagnosticLogger: DiagnosticLogger

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
                    suspendGeneration: suspendGeneration,
                    externalOpenQueue: externalOpenQueue,
                    diagnosticLogger: diagnosticLogger
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
            if ProcessInfo.processInfo.environment["ZUPULSE_UI_TEST_FIXTURE"] != nil ||
                ProcessInfo.processInfo.environment["ZUPULSE_UI_TEST_RECOVER_WEB_CONTENT"] == "1"
            {
                UITestImportStageView()
            }
            #endif
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button("导出诊断") {
                        exportDocument = DiagnosticExportDocument(
                            data: diagnosticLogger.exportData()
                        )
                        isExportingDiagnostics = true
                    }
                    .buttonStyle(.borderedProminent)
                    .padding()
                }
            }
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
        .onOpenURL { url in
            Task { await externalOpenQueue.enqueue(url) }
        }
        .fileExporter(
            isPresented: $isExportingDiagnostics,
            document: exportDocument,
            contentType: .json,
            defaultFilename: "zupulse-diagnostics"
        ) { _ in
            exportDocument = nil
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
