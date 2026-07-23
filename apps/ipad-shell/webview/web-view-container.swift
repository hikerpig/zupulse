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

    final class Coordinator {
        let webView: WKWebView

        init(entryURL: URL) {
            let configuration = WKWebViewConfiguration()
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
            let resourceHandler = AppResourceSchemeHandler(
                rootURL: entryURL.deletingLastPathComponent()
            )
            configuration.setURLSchemeHandler(
                resourceHandler,
                forURLScheme: AppResourceSchemeHandler.scheme
            )
            let messageHandler = BridgeMessageHandler(router: try? BridgeRouter.load())
            configuration.userContentController.addScriptMessageHandler(
                messageHandler,
                contentWorld: .page,
                name: BridgeMessageHandler.name
            )

            webView = WKWebView(frame: .zero, configuration: configuration)
            webView.load(URLRequest(url: AppResourceSchemeHandler.entryURL))
        }
    }
}
