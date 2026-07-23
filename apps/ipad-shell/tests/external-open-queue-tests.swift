import Foundation
import XCTest
@testable import Zupulse

final class ExternalOpenQueueTests: XCTestCase {
    func testColdStartQueuesThenDeliversOrderedUniqueURLs() async throws {
        let fixture = try ExternalOpenFixture()
        let queue = ExternalOpenQueue()
        let store = FileTokenStore()
        let events = ExternalOpenEventRecorder()

        await queue.enqueue(fixture.first)
        await queue.enqueue(fixture.second)
        await queue.enqueue(fixture.first)
        let queuedCount = await queue.pendingCount
        XCTAssertEqual(queuedCount, 2)

        await queue.attach(store: store) { event in await events.append(event) }
        let delivered = await events.waitForCount(2)

        XCTAssertEqual(delivered.map(\.fileName), ["first.gp", "second.musicxml"])
        XCTAssertEqual(Set(delivered.map(\.eventId)).count, 2)
        let remainingCount = await queue.pendingCount
        let tokenCount = await store.outstandingCount
        XCTAssertEqual(remainingCount, 0)
        XCTAssertEqual(tokenCount, 2)
    }

    func testWarmStartDeliversOnceAndPreservesArrivalOrder() async throws {
        let fixture = try ExternalOpenFixture()
        let queue = ExternalOpenQueue()
        let events = ExternalOpenEventRecorder()
        await queue.attach(store: FileTokenStore()) { event in await events.append(event) }

        await queue.enqueue(fixture.second)
        await queue.enqueue(fixture.first)
        await queue.enqueue(fixture.second)
        let delivered = await events.waitForCount(2)

        XCTAssertEqual(delivered.map(\.fileName), ["second.musicxml", "first.gp"])
    }

    func testDestroyDropsPendingAndClearsIssuedTokens() async throws {
        let fixture = try ExternalOpenFixture()
        let queue = ExternalOpenQueue()
        let store = FileTokenStore()
        let blocker = ExternalOpenBlocker()
        await queue.attach(store: store) { event in
            await blocker.record(event)
            try await blocker.wait()
        }
        await queue.enqueue(fixture.first)
        await blocker.waitUntilRecorded()

        await queue.destroy()

        let remainingCount = await queue.pendingCount
        let tokenCount = await store.outstandingCount
        XCTAssertEqual(remainingCount, 0)
        XCTAssertEqual(tokenCount, 0)
        await blocker.release()
    }

    func testWebContentReplacementRetriesPendingItemWithNewTokenStore() async throws {
        let fixture = try ExternalOpenFixture()
        let queue = ExternalOpenQueue()
        let failedDelivery = ExternalOpenEventRecorder()
        let replacementDelivery = ExternalOpenEventRecorder()
        let oldStore = FileTokenStore()
        let replacementStore = FileTokenStore()
        await queue.attach(store: oldStore) { event in
            await failedDelivery.append(event)
            throw ExternalOpenTestError.deliveryFailed
        }
        await queue.enqueue(fixture.first)
        _ = await failedDelivery.waitForCount(1)

        await queue.attach(store: replacementStore) { event in
            await replacementDelivery.append(event)
        }
        let delivered = await replacementDelivery.waitForCount(1)

        XCTAssertEqual(delivered.map(\.fileName), ["first.gp"])
        let oldTokenCount = await oldStore.outstandingCount
        let replacementTokenCount = await replacementStore.outstandingCount
        XCTAssertEqual(oldTokenCount, 0)
        XCTAssertEqual(replacementTokenCount, 1)
    }
}

private enum ExternalOpenTestError: Error {
    case deliveryFailed
}

private actor ExternalOpenEventRecorder {
    private var events: [ExternalOpenEvent] = []

    func append(_ event: ExternalOpenEvent) {
        events.append(event)
    }

    func waitForCount(_ count: Int) async -> [ExternalOpenEvent] {
        for _ in 0..<100 where events.count < count {
            try? await Task.sleep(for: .milliseconds(10))
        }
        return events
    }
}

private actor ExternalOpenBlocker {
    private var event: ExternalOpenEvent?
    private var released = false

    func record(_ event: ExternalOpenEvent) {
        self.event = event
    }

    func waitUntilRecorded() async {
        for _ in 0..<100 where event == nil {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func wait() async throws {
        while !released {
            try await Task.sleep(for: .milliseconds(10))
        }
    }

    func release() {
        released = true
    }
}

private struct ExternalOpenFixture {
    let root: URL
    let first: URL
    let second: URL

    init() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        first = root.appendingPathComponent("first.gp")
        second = root.appendingPathComponent("second.musicxml")
        try Data([1]).write(to: first)
        try Data([2, 3]).write(to: second)
    }
}
