import Foundation

let maximumScoreFileBytes = 64 * 1024 * 1024

struct FileTokenEntry: Sendable {
    let url: URL
    let fileName: String
    let sizeBytes: Int
}

actor FileTokenStore {
    private struct StoredEntry {
        let value: FileTokenEntry
        let expiresAt: Date
    }

    private var entries: [String: StoredEntry] = [:]
    private let maxBytes: Int
    private let ttl: TimeInterval
    private let now: @Sendable () -> Date

    init(
        maxBytes: Int = maximumScoreFileBytes,
        ttl: TimeInterval = 60,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.maxBytes = maxBytes
        self.ttl = ttl
        self.now = now
    }

    var outstandingCount: Int { entries.count }

    func issue(url: URL, fileName: String, sizeBytes: Int) throws -> String {
        try issueBatch([
            FileTokenEntry(url: url, fileName: fileName, sizeBytes: sizeBytes)
        ])[0]
    }

    func issueBatch(_ values: [FileTokenEntry]) throws -> [String] {
        for value in values {
            guard value.sizeBytes >= 0, value.sizeBytes <= maxBytes else {
                throw fileTokenError("FILE_TOO_LARGE")
            }
            guard value.url.isFileURL, !value.fileName.isEmpty else {
                throw fileTokenError("FILE_SELECTION_INVALID")
            }
        }
        let expiresAt = now().addingTimeInterval(ttl * Double(max(1, values.count)))
        return values.map { value in
            let token = UUID().uuidString.lowercased()
            entries[token] = StoredEntry(value: value, expiresAt: expiresAt)
            return token
        }
    }

    func consume(_ token: String) throws -> FileTokenEntry {
        guard let stored = entries.removeValue(forKey: token) else {
            throw fileTokenError("FILE_TOKEN_INVALID")
        }
        guard stored.expiresAt > now() else {
            throw fileTokenError("FILE_TOKEN_EXPIRED")
        }
        return stored.value
    }

    func discard(_ token: String) {
        entries.removeValue(forKey: token)
    }

    func clear() {
        entries.removeAll()
    }
}

private func fileTokenError(_ code: String) -> NSError {
    NSError(
        domain: "com.hikerpig.zupulse.file-token",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: code]
    )
}
