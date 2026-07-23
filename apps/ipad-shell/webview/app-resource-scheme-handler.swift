import Foundation
import WebKit

final class AppResourceSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "zupulse"
    static let host = "app"
    static let entryURL = URL(string: "\(scheme)://\(host)/index.html")!

    private let rootURL: URL

    init(rootURL: URL) {
        self.rootURL = rootURL.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            let fileURL = try resolve(urlSchemeTask.request.url)
            let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
            let response = URLResponse(
                url: try requireURL(urlSchemeTask.request.url),
                mimeType: mimeType(for: fileURL.pathExtension),
                expectedContentLength: data.count,
                textEncodingName: isText(fileURL.pathExtension) ? "utf-8" : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func resolve(_ value: URL?) throws -> URL {
        let url = try requireURL(value)
        guard
            url.scheme == Self.scheme,
            url.host == Self.host,
            url.user == nil,
            url.password == nil,
            url.port == nil,
            url.query == nil,
            url.fragment == nil
        else {
            throw resourceError("INVALID_RESOURCE_ORIGIN")
        }

        let components = try url.path
            .split(separator: "/", omittingEmptySubsequences: true)
            .map { component -> String in
                guard
                    let decoded = String(component).removingPercentEncoding,
                    decoded != ".",
                    decoded != "..",
                    !decoded.contains("/")
                else {
                    throw resourceError("INVALID_RESOURCE_PATH")
                }
                return decoded
            }
        guard !components.isEmpty else {
            throw resourceError("INVALID_RESOURCE_PATH")
        }

        let fileURL = components.reduce(rootURL) { partial, component in
            partial.appendingPathComponent(component, isDirectory: false)
        }.standardizedFileURL
        let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : "\(rootURL.path)/"
        guard fileURL.path.hasPrefix(rootPath) else {
            throw resourceError("RESOURCE_PATH_ESCAPE")
        }
        return fileURL
    }
}

private func requireURL(_ value: URL?) throws -> URL {
    guard let value else { throw resourceError("INVALID_RESOURCE_URL") }
    return value
}

private func mimeType(for pathExtension: String) -> String {
    switch pathExtension.lowercased() {
    case "html": "text/html"
    case "css": "text/css"
    case "js", "mjs": "text/javascript"
    case "json": "application/json"
    case "woff2": "font/woff2"
    case "sf3": "audio/sf3"
    default: "application/octet-stream"
    }
}

private func isText(_ pathExtension: String) -> Bool {
    ["html", "css", "js", "mjs", "json"].contains(pathExtension.lowercased())
}

private func resourceError(_ code: String) -> NSError {
    NSError(
        domain: "com.hikerpig.zupulse.resource",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: code]
    )
}
