import OSLog
import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    let entryURL: URL
    let suspendGeneration: Int

    init(entryURL: URL, suspendGeneration: Int = 0) {
        self.entryURL = entryURL
        self.suspendGeneration = suspendGeneration
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(entryURL: entryURL)
    }

    func makeUIView(context: Context) -> WKWebView {
        context.coordinator.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.requestSuspend(generation: suspendGeneration)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.lifecycleCoordinator.request(.prepareClose)
    }

    @MainActor
    final class Coordinator {
        let webView: WKWebView
        let resourceHandler: AppResourceSchemeHandler
        let fileTokens: FileTokenStore
        let lifecycleCoordinator: LifecycleCoordinator
        private(set) var requestedResourcePaths: [String] = []
        private var lastSuspendGeneration = 0

        init(entryURL: URL) {
            let configuration = WKWebViewConfiguration()
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
            #if DEBUG
            let environment = ProcessInfo.processInfo.environment
            if environment["ZUPULSE_UI_TEST_FIXTURE"] != nil {
                configuration.userContentController.addUserScript(
                    WKUserScript(
                        source: """
                        (() => {
                          const timer = setInterval(() => {
                            const buttons = [...document.querySelectorAll("button")];
                            const button = buttons.find(
                              (candidate) =>
                                !candidate.disabled &&
                                ["导入第一份曲谱", "导入曲谱"].includes(candidate.textContent?.trim() ?? "")
                            );
                            if (!button) return;
                            clearInterval(timer);
                            button.click();
                          }, 100);
                        })();
                        """,
                        injectionTime: .atDocumentEnd,
                        forMainFrameOnly: true
                    )
                )
            }
            if environment["ZUPULSE_UI_TEST_OPEN_FIRST"] == "1" {
                configuration.userContentController.addUserScript(
                    WKUserScript(
                        source: """
                        (() => {
                          const timer = setInterval(() => {
                            const score = document.querySelector('li[role="button"]');
                            if (!score) return;
                            clearInterval(timer);
                            score.click();
                          }, 100);
                        })();
                        """,
                        injectionTime: .atDocumentEnd,
                        forMainFrameOnly: true
                    )
                )
            }
            #endif
            fileTokens = FileTokenStore()
            let binaryService = BinaryDataService(store: fileTokens)
            resourceHandler = AppResourceSchemeHandler(
                rootURL: entryURL.deletingLastPathComponent(),
                binaryService: binaryService
            )
            configuration.setURLSchemeHandler(
                resourceHandler,
                forURLScheme: AppResourceSchemeHandler.scheme
            )
            configuration.setURLSchemeHandler(
                BinaryDataSchemeHandler(service: binaryService),
                forURLScheme: BinaryDataSchemeHandler.scheme
            )
            webView = WKWebView(frame: .zero, configuration: configuration)
            weak var weakWebView = webView
            let logger = Logger(
                subsystem: "com.hikerpig.zupulse",
                category: "lifecycle"
            )
            lifecycleCoordinator = LifecycleCoordinator(
                emit: { event in
                    Task { @MainActor in
                        try? await weakWebView?.callAsyncJavaScript(
                            """
                            window.dispatchEvent(
                              new CustomEvent("zupulse:bridge-event", { detail: event })
                            );
                            """,
                            arguments: ["event": event.dictionary],
                            contentWorld: .page
                        )
                    }
                },
                diagnose: { code in
                    logger.error("\(code, privacy: .public)")
                }
            )
            let systemFileSelector = DocumentPickerCoordinator {
                var viewController = weakWebView?.window?.rootViewController
                while let presented = viewController?.presentedViewController {
                    viewController = presented
                }
                return viewController
            }
            #if DEBUG
            let fileSelector: any DocumentPicking =
                bundledFixtureDocumentPicker() ?? systemFileSelector
            #else
            let fileSelector: any DocumentPicking = systemFileSelector
            #endif
            let messageHandler = BridgeMessageHandler(
                router: try? BridgeRouter.load(
                    fileSelector: fileSelector,
                    fileTokens: fileTokens,
                    lifecycleCoordinator: lifecycleCoordinator
                )
            )
            configuration.userContentController.addScriptMessageHandler(
                messageHandler,
                contentWorld: .page,
                name: BridgeMessageHandler.name
            )

            resourceHandler.onRequest = { [weak self] path in
                self?.requestedResourcePaths.append(path)
            }
            webView.load(URLRequest(url: AppResourceSchemeHandler.entryURL))
        }

        func requestSuspend(generation: Int) {
            guard generation > lastSuspendGeneration else { return }
            lastSuspendGeneration = generation
            lifecycleCoordinator.request(.suspend)
        }

        deinit {
            let tokens = fileTokens
            Task { await tokens.clear() }
        }
    }
}
