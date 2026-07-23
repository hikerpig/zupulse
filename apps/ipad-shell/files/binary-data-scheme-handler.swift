import Foundation
import WebKit

struct BinaryDataRequestResolver {
    func token(from value: URL?) throws -> String {
        guard
            let url = value,
            url.scheme == BinaryDataSchemeHandler.scheme,
            url.host == BinaryDataSchemeHandler.host,
            url.user == nil,
            url.password == nil,
            url.port == nil,
            url.query == nil,
            url.fragment == nil
        else {
            throw binaryDataError("BINARY_URL_INVALID")
        }
        let components = url.path.split(separator: "/", omittingEmptySubsequences: true)
        guard
            components.count == 1,
            let token = components.first.map(String.init),
            UUID(uuidString: token) != nil,
            token == token.lowercased()
        else {
            throw binaryDataError("BINARY_TOKEN_INVALID")
        }
        return token
    }
}

protocol SecurityScopedAccessing: Sendable {
    func startAccessing(_ url: URL) -> @Sendable () -> Void
}

struct SystemSecurityScopedAccess: SecurityScopedAccessing {
    func startAccessing(_ url: URL) -> @Sendable () -> Void {
        let started = url.startAccessingSecurityScopedResource()
        return {
            if started { url.stopAccessingSecurityScopedResource() }
        }
    }
}

struct BinaryDataResponse: Sendable {
    let data: Data
    let mimeType: String
    let expectedContentLength: Int
}

struct BinaryDataService: Sendable {
    let store: FileTokenStore
    let securityScope: SecurityScopedAccessing
    let maxBytes: Int
    let readData: @Sendable (URL) throws -> Data
    private let resolver = BinaryDataRequestResolver()

    init(
        store: FileTokenStore,
        securityScope: SecurityScopedAccessing = SystemSecurityScopedAccess(),
        maxBytes: Int = maximumScoreFileBytes,
        readData: @escaping @Sendable (URL) throws -> Data = {
            try Data(contentsOf: $0, options: .mappedIfSafe)
        }
    ) {
        self.store = store
        self.securityScope = securityScope
        self.maxBytes = maxBytes
        self.readData = readData
    }

    func read(_ url: URL) async throws -> BinaryDataResponse {
        let entry = try await store.consume(resolver.token(from: url))
        let stopAccessing = securityScope.startAccessing(entry.url)
        defer { stopAccessing() }
        try Task.checkCancellation()
        let data = try readData(entry.url)
        try Task.checkCancellation()
        guard data.count <= maxBytes else { throw binaryDataError("FILE_TOO_LARGE") }
        return BinaryDataResponse(
            data: data,
            mimeType: mimeType(for: entry.fileName),
            expectedContentLength: data.count
        )
    }
}

final class BinaryDataSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "zupulse-data"
    static let host = "file"

    private let service: BinaryDataService
    private let lock = NSLock()
    private var tasks: [ObjectIdentifier: Task<Void, Never>] = [:]

    init(service: BinaryDataService) {
        self.service = service
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let identifier = ObjectIdentifier(urlSchemeTask)
        let task = Task { [weak self] in
            do {
                guard let url = urlSchemeTask.request.url else {
                    throw binaryDataError("BINARY_URL_INVALID")
                }
                let value = try await service.read(url)
                try Task.checkCancellation()
                let response = URLResponse(
                    url: url,
                    mimeType: value.mimeType,
                    expectedContentLength: value.expectedContentLength,
                    textEncodingName: nil
                )
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(value.data)
                urlSchemeTask.didFinish()
            } catch is CancellationError {
                // WebKit already cancelled the request.
            } catch {
                urlSchemeTask.didFailWithError(error)
            }
            self?.remove(identifier)
        }
        lock.lock()
        tasks[identifier] = task
        lock.unlock()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let identifier = ObjectIdentifier(urlSchemeTask)
        lock.lock()
        let task = tasks.removeValue(forKey: identifier)
        lock.unlock()
        task?.cancel()
    }

    private func remove(_ identifier: ObjectIdentifier) {
        lock.lock()
        tasks.removeValue(forKey: identifier)
        lock.unlock()
    }
}

private func mimeType(for fileName: String) -> String {
    switch URL(fileURLWithPath: fileName).pathExtension.lowercased() {
    case "musicxml", "xml": "application/vnd.recordare.musicxml+xml"
    case "mxl": "application/vnd.recordare.musicxml"
    default: "application/octet-stream"
    }
}

private func binaryDataError(_ code: String) -> NSError {
    NSError(
        domain: "com.hikerpig.zupulse.binary-data",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: code]
    )
}
