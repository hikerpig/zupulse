import OSLog
import SwiftUI
import UIKit
import WebKit

struct WebViewContainer: UIViewRepresentable {
    let entryURL: URL
    let suspendGeneration: Int
    let externalOpenQueue: ExternalOpenQueue

    init(
        entryURL: URL,
        suspendGeneration: Int = 0,
        externalOpenQueue: ExternalOpenQueue = ExternalOpenQueue()
    ) {
        self.entryURL = entryURL
        self.suspendGeneration = suspendGeneration
        self.externalOpenQueue = externalOpenQueue
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(entryURL: entryURL, externalOpenQueue: externalOpenQueue)
    }

    func makeUIView(context: Context) -> WebViewHostView {
        context.coordinator.hostView
    }

    func updateUIView(_ hostView: WebViewHostView, context: Context) {
        context.coordinator.requestSuspend(generation: suspendGeneration)
    }

    static func dismantleUIView(_ hostView: WebViewHostView, coordinator: Coordinator) {
        coordinator.lifecycleCoordinator.request(.prepareClose)
        Task { await coordinator.externalOpenQueue.destroy() }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        let hostView = WebViewHostView()
        private let entryURL: URL
        let externalOpenQueue: ExternalOpenQueue
        private var runtime: WebViewRuntime
        private var pendingRuntimes: [ObjectIdentifier: WebViewRuntime] = [:]
        private var lastSuspendGeneration = 0
        private let navigationPolicy = NavigationPolicy()

        var webView: WKWebView { runtime.webView }
        var resourceHandler: AppResourceSchemeHandler { runtime.resourceHandler }
        var fileTokens: FileTokenStore { runtime.fileTokens }
        var lifecycleCoordinator: LifecycleCoordinator { runtime.lifecycleCoordinator }
        var requestedResourcePaths: [String] { runtime.requestedPaths.values }

        private lazy var recoveryCoordinator = WebContentRecoveryCoordinator(
            initialContent: runtime.webView,
            makeReplacement: { [weak self] in
                guard let self else { return WKWebView() }
                let replacement = WebViewRuntime(
                    entryURL: self.entryURL,
                    externalOpenQueue: self.externalOpenQueue
                )
                replacement.webView.navigationDelegate = self
                self.pendingRuntimes[ObjectIdentifier(replacement.webView)] = replacement
                return replacement.webView
            },
            install: { [weak self] webView in
                guard
                    let self,
                    let replacement = self.pendingRuntimes.removeValue(
                        forKey: ObjectIdentifier(webView)
                    )
                else { return }
                self.runtime = replacement
                self.hostView.install(webView)
            }
        )

        init(entryURL: URL, externalOpenQueue: ExternalOpenQueue = ExternalOpenQueue()) {
            self.entryURL = entryURL
            self.externalOpenQueue = externalOpenQueue
            runtime = WebViewRuntime(entryURL: entryURL, externalOpenQueue: externalOpenQueue)
            super.init()
            runtime.webView.navigationDelegate = self
            hostView.install(runtime.webView)
            #if DEBUG
            if ProcessInfo.processInfo.environment[
                "ZUPULSE_UI_TEST_RECOVER_WEB_CONTENT"
            ] == "1" {
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(2))
                    guard let self else { return }
                    self.webViewWebContentProcessDidTerminate(self.webView)
                }
            }
            #endif
        }

        func requestSuspend(generation: Int) {
            guard generation > lastSuspendGeneration else { return }
            lastSuspendGeneration = generation
            lifecycleCoordinator.request(.suspend)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            recoveryCoordinator.contentProcessDidTerminate(webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            #if DEBUG
            if recoveryCoordinator.replacementCount > 0,
               webView === recoveryCoordinator.activeContent
            {
                UITestImportStage.shared.value = "WEB_CONTENT_RECOVERED"
            }
            #endif
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            let decision = navigationPolicy.decide(
                url: navigationAction.request.url,
                isMainFrame: navigationAction.targetFrame?.isMainFrame == true,
                isUserInitiated: navigationAction.zupulseIsUserInitiated
            )
            switch decision {
            case .allow:
                decisionHandler(.allow)
            case .cancel:
                decisionHandler(.cancel)
            case let .openExternally(url):
                decisionHandler(.cancel)
                UIApplication.shared.open(url)
            }
        }
    }
}

@MainActor
final class WebViewHostView: UIView {
    private weak var installedWebView: WKWebView?

    func install(_ webView: WKWebView) {
        installedWebView?.removeFromSuperview()
        installedWebView = webView
        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: trailingAnchor),
            webView.topAnchor.constraint(equalTo: topAnchor),
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}

@MainActor
private final class WebViewRuntime {
    let webView: WKWebView
    let resourceHandler: AppResourceSchemeHandler
    let fileTokens: FileTokenStore
    let lifecycleCoordinator: LifecycleCoordinator
    let requestedPaths = RequestedPathStore()

    init(entryURL: URL, externalOpenQueue: ExternalOpenQueue) {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
        if environment["ZUPULSE_UI_TEST_EPHEMERAL_STORAGE"] == "1" {
            configuration.websiteDataStore = .nonPersistent()
        }
        if environment["ZUPULSE_UI_TEST_START_LIBRARY"] == "1" {
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: """
                    localStorage.setItem(
                      "zupulse-ipad-route",
                      JSON.stringify({ route: "library" })
                    );
                    """,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }
        if environment["ZUPULSE_UI_TEST_RESET_SCORE_ZOOM"] == "1" {
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: """
                    localStorage.setItem("zupulse-score-zoom", "1");
                    """,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }
        if environment["ZUPULSE_UI_TEST_FIXTURE"] != nil ||
            environment["ZUPULSE_UI_TEST_FIXTURES"] != nil
        {
            let importButtonTitle = environment["ZUPULSE_UI_TEST_FIXTURES"] == nil
                ? "导入曲谱"
                : "批量导入"
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: """
                    (() => {
                      const timer = setInterval(() => {
                        const buttons = [...document.querySelectorAll("button")];
                        const button = buttons.find(
                          (candidate) =>
                            !candidate.disabled &&
                            candidate.textContent?.trim() === "\(importButtonTitle)"
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

        let webViewBox = WeakWebViewBox()
        let logger = Logger(
            subsystem: "com.hikerpig.zupulse",
            category: "lifecycle"
        )
        lifecycleCoordinator = LifecycleCoordinator(
            emit: { event in
                Task { @MainActor in
                    try? await webViewBox.value?.callAsyncJavaScript(
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
            var viewController = webViewBox.value?.window?.rootViewController
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
        configuration.userContentController.add(
            ExternalOpenReadyMessageHandler(
                queue: externalOpenQueue,
                store: fileTokens,
                webView: webViewBox
            ),
            name: ExternalOpenReadyMessageHandler.name
        )

        webView = WKWebView(frame: .zero, configuration: configuration)
        webViewBox.value = webView
        let requestedPaths = requestedPaths
        resourceHandler.onRequest = { [weak requestedPaths] path in
            requestedPaths?.values.append(path)
        }
        webView.load(URLRequest(url: AppResourceSchemeHandler.entryURL))
    }

    deinit {
        let tokens = fileTokens
        Task { await tokens.clear() }
    }
}

@MainActor
private final class ExternalOpenReadyMessageHandler: NSObject, WKScriptMessageHandler {
    static let name = "zupulseExternalOpenReady"

    private let queue: ExternalOpenQueue
    private let store: FileTokenStore
    private let webView: WeakWebViewBox

    init(queue: ExternalOpenQueue, store: FileTokenStore, webView: WeakWebViewBox) {
        self.queue = queue
        self.store = store
        self.webView = webView
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        let webView = webView
        Task {
            await queue.attach(store: store) { event in
                try await emitExternalOpen(event, to: webView)
            }
        }
    }
}

@MainActor
private func emitExternalOpen(
    _ event: ExternalOpenEvent,
    to webView: WeakWebViewBox
) async throws {
    guard let current = webView.value else {
        throw ExternalOpenDeliveryError.webViewUnavailable
    }
    _ = try await current.callAsyncJavaScript(
        """
        window.dispatchEvent(
          new CustomEvent("zupulse:external-open", { detail: event })
        );
        """,
        arguments: [
            "event": [
                "eventId": event.eventId,
                "fileToken": event.fileToken,
                "fileName": event.fileName,
                "sizeBytes": event.sizeBytes,
            ]
        ],
        contentWorld: .page
    )
}

private enum ExternalOpenDeliveryError: Error {
    case webViewUnavailable
}

@MainActor
private final class WeakWebViewBox {
    weak var value: WKWebView?
}

@MainActor
private final class RequestedPathStore {
    var values: [String] = []
}
