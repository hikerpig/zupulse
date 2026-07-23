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

            webView = WKWebView(frame: .zero, configuration: configuration)
            webView.loadFileURL(
                entryURL,
                allowingReadAccessTo: entryURL.deletingLastPathComponent()
            )
        }
    }
}
