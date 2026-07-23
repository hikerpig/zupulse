import OSLog
import SwiftUI
import UIKit
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

    func makeUIView(context: Context) -> WebViewHostView {
        context.coordinator.hostView
    }

    func updateUIView(_ hostView: WebViewHostView, context: Context) {
        context.coordinator.requestSuspend(generation: suspendGeneration)
    }

    static func dismantleUIView(_ hostView: WebViewHostView, coordinator: Coordinator) {
        coordinator.lifecycleCoordinator.request(.prepareClose)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        let hostView = WebViewHostView()
        private let entryURL: URL
        private var runtime: WebViewRuntime
        private var pendingRuntimes: [ObjectIdentifier: WebViewRuntime] = [:]
        private var lastSuspendGeneration = 0

        var webView: WKWebView { runtime.webView }
        var resourceHandler: AppResourceSchemeHandler { runtime.resourceHandler }
        var fileTokens: FileTokenStore { runtime.fileTokens }
        var lifecycleCoordinator: LifecycleCoordinator { runtime.lifecycleCoordinator }
        var requestedResourcePaths: [String] { runtime.requestedPaths.values }

        private lazy var recoveryCoordinator = WebContentRecoveryCoordinator(
            initialContent: runtime.webView,
            makeReplacement: { [weak self] in
                guard let self else { return WKWebView() }
                let replacement = WebViewRuntime(entryURL: self.entryURL)
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

        init(entryURL: URL) {
            self.entryURL = entryURL
            runtime = WebViewRuntime(entryURL: entryURL)
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

    init(entryURL: URL) {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
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
private final class WeakWebViewBox {
    weak var value: WKWebView?
}

@MainActor
private final class RequestedPathStore {
    var values: [String] = []
}
