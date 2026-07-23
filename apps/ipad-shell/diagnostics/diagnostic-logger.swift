import Foundation

struct DiagnosticEvent: Codable, Equatable {
    let timestamp: String
    let code: String
    let durationMs: Double?
    let contentHashPrefix: String?
}

final class DiagnosticLogger {
    private let directory: URL
    private let maximumBytes: Int
    private let maximumFiles: Int
    private let lock = NSLock()
    private let encoder = JSONEncoder()
    private let timestamp: () -> String

    init(
        directory: URL,
        maximumBytes: Int = 64 * 1024,
        maximumFiles: Int = 3,
        timestamp: @escaping () -> String = { ISO8601DateFormatter().string(from: Date()) }
    ) {
        self.directory = directory
        self.maximumBytes = maximumBytes
        self.maximumFiles = maximumFiles
        self.timestamp = timestamp
    }

    func record(code: String, durationMs: Double? = nil, contentHashPrefix: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        let event = DiagnosticEvent(
            timestamp: timestamp(),
            code: code,
            durationMs: durationMs,
            contentHashPrefix: contentHashPrefix
        )
        guard var line = try? encoder.encode(event) else { return }
        line.append(0x0A)
        try? FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        rotateIfNeeded(incomingBytes: line.count)
        let current = logURL(index: 0)
        if !FileManager.default.fileExists(atPath: current.path) {
            FileManager.default.createFile(atPath: current.path, contents: nil)
        }
        guard let handle = try? FileHandle(forWritingTo: current) else { return }
        defer { try? handle.close() }
        try? handle.seekToEnd()
        try? handle.write(contentsOf: line)
    }

    func exportData() -> Data {
        lock.lock()
        defer { lock.unlock() }
        var result = Data()
        for index in stride(from: maximumFiles - 1, through: 0, by: -1) {
            guard let data = try? Data(contentsOf: logURL(index: index)) else { continue }
            result.append(data)
        }
        return result
    }

    private func rotateIfNeeded(incomingBytes: Int) {
        let current = logURL(index: 0)
        let currentBytes = (try? current.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard currentBytes + incomingBytes > maximumBytes else { return }
        if maximumFiles > 1 {
            for index in stride(from: maximumFiles - 1, through: 1, by: -1) {
                let destination = logURL(index: index)
                try? FileManager.default.removeItem(at: destination)
                let source = logURL(index: index - 1)
                if FileManager.default.fileExists(atPath: source.path) {
                    try? FileManager.default.moveItem(at: source, to: destination)
                }
            }
        } else {
            try? FileManager.default.removeItem(at: current)
        }
    }

    private func logURL(index: Int) -> URL {
        directory.appendingPathComponent("diagnostics-\(index).jsonl")
    }
}
