import Foundation

struct ExternalOpenEvent: Sendable, Equatable {
    let eventId: String
    let fileToken: String
    let fileName: String
    let sizeBytes: Int
}

actor ExternalOpenQueue {
    typealias Emit = @Sendable (ExternalOpenEvent) async throws -> Void

    private struct Pending: Sendable {
        let eventId: String
        let url: URL
    }

    private var pending: [Pending] = []
    private var seen: Set<String> = []
    private var activeStore: FileTokenStore?
    private var emit: Emit?
    private var draining = false
    private var destroyed = false
    private var attachmentGeneration = 0

    var pendingCount: Int { pending.count }

    func enqueue(_ url: URL) {
        guard !destroyed, url.isFileURL else { return }
        let identity = url.standardizedFileURL.absoluteString
        guard seen.insert(identity).inserted else { return }
        pending.append(Pending(eventId: UUID().uuidString.lowercased(), url: url))
        startDrain()
    }

    func attach(store: FileTokenStore, emit: @escaping Emit) {
        guard !destroyed else { return }
        activeStore = store
        self.emit = emit
        attachmentGeneration += 1
        startDrain()
    }

    func destroy() async {
        guard !destroyed else { return }
        destroyed = true
        pending.removeAll()
        seen.removeAll()
        emit = nil
        let store = activeStore
        activeStore = nil
        await store?.clear()
    }

    private func startDrain() {
        guard !draining, !pending.isEmpty, activeStore != nil, emit != nil else { return }
        draining = true
        Task { await drain() }
    }

    private func drain() async {
        let startedWithGeneration = attachmentGeneration
        while
            !destroyed,
            let next = pending.first,
            let store = activeStore,
            let emit
        {
            do {
                let metadata = try validateSelectedFile(next.url)
                let token = try await store.issue(
                    url: metadata.url,
                    fileName: metadata.fileName,
                    sizeBytes: metadata.sizeBytes
                )
                do {
                    try await emit(
                        ExternalOpenEvent(
                            eventId: next.eventId,
                            fileToken: token,
                            fileName: metadata.fileName,
                            sizeBytes: metadata.sizeBytes
                        )
                    )
                    removePending(next.eventId)
                } catch {
                    await store.discard(token)
                    break
                }
            } catch {
                removePending(next.eventId)
            }
        }
        draining = false
        if attachmentGeneration != startedWithGeneration {
            startDrain()
        }
    }

    private func removePending(_ eventId: String) {
        guard let index = pending.firstIndex(where: { $0.eventId == eventId }) else { return }
        pending.remove(at: index)
    }
}
