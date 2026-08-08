import Foundation

struct BridgeEnvelope: Equatable {
    let bridgeVersion: String
    let correlationId: String
    let type: String
    let payload: BridgeRequestPayload
}

enum BridgeRequestPayload: Equatable {
    case handshake(HandshakePayload)
    case fileSelect(FileSelectPayload)
    case lifecycleAck(LifecycleAckPayload)
    case diagnosticsWrite(DiagnosticsWritePayload)
}

struct HandshakePayload: Equatable {
    let appVersion: String
    let rendererBuildHash: String
}

struct FileSelectPayload: Equatable {
    let multiple: Bool
}

struct LifecycleAckPayload: Equatable {
    let state: String
}

struct DiagnosticsWritePayload: Equatable {
    let code: String
    let operation: String?
    let errorCode: String?
    let durationMs: Double?
    let contentHashPrefix: String?
}
