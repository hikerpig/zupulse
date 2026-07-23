import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    let entryURL: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(entryURL: entryURL)
    }

    func makeUIView(context: Context) -> WKWebView {
        context.coordinator.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator {
        let webView: WKWebView
        let resourceHandler: AppResourceSchemeHandler
        let fileTokens: FileTokenStore
        private(set) var requestedResourcePaths: [String] = []

        init(entryURL: URL) {
            let configuration = WKWebViewConfiguration()
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
            resourceHandler = AppResourceSchemeHandler(
                rootURL: entryURL.deletingLastPathComponent()
            )
            fileTokens = FileTokenStore()
            configuration.setURLSchemeHandler(
                resourceHandler,
                forURLScheme: AppResourceSchemeHandler.scheme
            )
            configuration.setURLSchemeHandler(
                BinaryDataSchemeHandler(service: BinaryDataService(store: fileTokens)),
                forURLScheme: BinaryDataSchemeHandler.scheme
            )
            webView = WKWebView(frame: .zero, configuration: configuration)
            weak var weakWebView = webView
            let fileSelector = DocumentPickerCoordinator {
                var presenter = weakWebView?.window?.rootViewController
                while let presented = presenter?.presentedViewController {
                    presenter = presented
                }
                return presenter
            }
            let messageHandler = BridgeMessageHandler(
                router: try? BridgeRouter.load(
                    fileSelector: fileSelector,
                    fileTokens: fileTokens
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

        deinit {
            let tokens = fileTokens
            Task { await tokens.clear() }
        }
    }
}
