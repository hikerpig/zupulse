import Foundation
import WebKit

final class AppResourceSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "zupulse"
    static let host = "app"
    static let entryURL = URL(string: "\(scheme)://\(host)/index.html")!

    private let resolver: AppResourceResolver
    private let binaryService: BinaryDataService?
    var onRequest: ((String) -> Void)?

    init(rootURL: URL, binaryService: BinaryDataService? = nil) {
        resolver = AppResourceResolver(rootURL: rootURL)
        self.binaryService = binaryService
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        if
            let url = urlSchemeTask.request.url,
            let token = restrictedDataToken(from: url),
            let binaryService
        {
            #if DEBUG
            UITestImportStage.shared.value = "DATA_REQUESTED"
            #endif
            Task { @MainActor in
                do {
                    let value = try await binaryService.readToken(token)
                    guard let response = HTTPURLResponse(
                        url: url,
                        statusCode: 200,
                        httpVersion: "HTTP/1.1",
                        headerFields: [
                            "Content-Length": String(value.expectedContentLength),
                            "Content-Type": value.mimeType,
                            "Cache-Control": "no-store",
                        ]
                    ) else {
                        throw resourceError("RESOURCE_RESPONSE_INVALID")
                    }
                    urlSchemeTask.didReceive(response)
                    urlSchemeTask.didReceive(value.data)
                    urlSchemeTask.didFinish()
                    #if DEBUG
                    UITestImportStage.shared.value = "BYTES_SERVED"
                    #endif
                } catch {
                    #if DEBUG
                    UITestImportStage.shared.value = "DATA_FAILED"
                    #endif
                    urlSchemeTask.didFailWithError(error)
                }
            }
            return
        }
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

    private func restrictedDataToken(from url: URL) -> String? {
        guard
            url.scheme == Self.scheme,
            url.host == Self.host,
            url.query == nil,
            url.fragment == nil
        else {
            return nil
        }
        let components = url.path.split(separator: "/", omittingEmptySubsequences: true)
        guard components.count == 2, components[0] == "__data" else {
            return nil
        }
        let token = String(components[1])
        guard UUID(uuidString: token) != nil, token == token.lowercased() else {
            return nil
        }
        return token
    }
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
