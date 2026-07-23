import Foundation
import WebKit

final class AppResourceSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "zupulse"
    static let host = "app"
    static let entryURL = URL(string: "\(scheme)://\(host)/index.html")!

    private let resolver: AppResourceResolver
    var onRequest: ((String) -> Void)?

    init(rootURL: URL) {
        resolver = AppResourceResolver(rootURL: rootURL)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            let fileURL = try resolver.resolve(urlSchemeTask.request.url)
            onRequest?(try requireURL(urlSchemeTask.request.url).path)
            let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
            let response = URLResponse(
                url: try requireURL(urlSchemeTask.request.url),
                mimeType: resolver.mimeType(forPathExtension: fileURL.pathExtension),
                expectedContentLength: data.count,
                textEncodingName: resolver.isText(pathExtension: fileURL.pathExtension) ? "utf-8" : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

struct AppResourceResolver {
    private let rootURL: URL

    init(rootURL: URL) {
        self.rootURL = rootURL.standardizedFileURL.resolvingSymlinksInPath()
    }

    func resolve(_ value: URL?) throws -> URL {
        let url = try requireURL(value)
        guard
            url.scheme == AppResourceSchemeHandler.scheme,
            url.host == AppResourceSchemeHandler.host,
            url.user == nil,
            url.password == nil,
            url.port == nil,
            url.query == nil,
            url.fragment == nil
        else {
            throw resourceError("INVALID_RESOURCE_ORIGIN")
        }
        let encodedPath = url.absoluteString
            .split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
            .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
            .lowercased()
        guard !encodedPath.contains("%2f"), !encodedPath.contains("%5c") else {
            throw resourceError("INVALID_RESOURCE_PATH")
        }

        let components = try url.path
            .split(separator: "/", omittingEmptySubsequences: true)
            .map { component -> String in
                guard
                    let decoded = String(component).removingPercentEncoding,
                    decoded != ".",
                    decoded != "..",
                    !decoded.contains("/"),
                    !decoded.contains("\\")
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
        }.standardizedFileURL.resolvingSymlinksInPath()
        let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : "\(rootURL.path)/"
        guard fileURL.path.hasPrefix(rootPath) else {
            throw resourceError("RESOURCE_PATH_ESCAPE")
        }
        return fileURL
    }

    func mimeType(forPathExtension pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html": "text/html"
        case "css": "text/css"
        case "js", "mjs": "text/javascript"
        case "json": "application/json"
        case "woff": "font/woff"
        case "woff2": "font/woff2"
        case "otf": "font/otf"
        case "eot": "application/vnd.ms-fontobject"
        case "svg": "image/svg+xml"
        case "sf3": "audio/sf3"
        default: "application/octet-stream"
        }
    }

    func isText(pathExtension: String) -> Bool {
        ["html", "css", "js", "mjs", "json", "svg"].contains(pathExtension.lowercased())
    }
}

private func requireURL(_ value: URL?) throws -> URL {
    guard let value else { throw resourceError("INVALID_RESOURCE_URL") }
    return value
}

private func resourceError(_ code: String) -> NSError {
    NSError(
        domain: "com.hikerpig.zupulse.resource",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: code]
    )
}
