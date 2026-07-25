import Foundation

enum LifecycleState: String, Hashable {
    case suspend
    case prepareClose = "prepare-close"
}

struct LifecycleEventEnvelope: Equatable {
    let bridgeVersion = "3.0.0"
    let correlationId: String
    let type = "app.lifecycle"
    let state: LifecycleState

    var dictionary: [String: Any] {
        [
            "bridgeVersion": bridgeVersion,
            "correlationId": correlationId,
            "type": type,
            "payload": ["state": state.rawValue],
        ]
    }
}

final class LifecycleCoordinator {
    typealias TimeoutScheduler = (
        _ action: @escaping () -> Void
    ) -> () -> Void

    private struct Pending {
        let correlationId: String
        var cancelTimeout: () -> Void
    }

    private var pending: [LifecycleState: Pending] = [:]
    private let scheduleTimeout: TimeoutScheduler
    private let emit: (LifecycleEventEnvelope) -> Void
    private let diagnose: (String) -> Void

    init(
        scheduleTimeout: @escaping TimeoutScheduler = LifecycleCoordinator.defaultSchedule,
        emit: @escaping (LifecycleEventEnvelope) -> Void,
        diagnose: @escaping (String) -> Void
    ) {
        self.scheduleTimeout = scheduleTimeout
        self.emit = emit
        self.diagnose = diagnose
    }

    var pendingStates: Set<LifecycleState> {
        Set(pending.keys)
    }

    func request(_ state: LifecycleState) {
        guard pending[state] == nil else { return }
        let correlationId = UUID().uuidString.lowercased()
        pending[state] = Pending(correlationId: correlationId, cancelTimeout: {})
        let cancelTimeout = scheduleTimeout { [weak self] in
            self?.expire(state, correlationId: correlationId)
        }
        if pending[state]?.correlationId == correlationId {
            pending[state]?.cancelTimeout = cancelTimeout
        }
        emit(
            LifecycleEventEnvelope(
                correlationId: correlationId,
                state: state
            )
        )
    }

    @discardableResult
    func acknowledge(_ state: LifecycleState) -> Bool {
        guard let value = pending.removeValue(forKey: state) else {
            return false
        }
        value.cancelTimeout()
        return true
    }

    private func expire(_ state: LifecycleState, correlationId: String) {
        guard pending[state]?.correlationId == correlationId else { return }
        pending.removeValue(forKey: state)
        diagnose("LIFECYCLE_ACK_TIMEOUT")
    }

    private static func defaultSchedule(
        _ action: @escaping () -> Void
    ) -> () -> Void {
        let workItem = DispatchWorkItem(block: action)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: workItem)
        return { workItem.cancel() }
    }
}
