import CoreFoundation
import Foundation

final class BridgeContractValidator {
    private static let bridgeVersion = "3.0.0"
    private let correlationLock = NSLock()
    private var correlationIds = Set<String>()

    func validate(_ data: Data) -> Result<BridgeEnvelope, BridgeValidationError> {
        do {
            let object = try JSONSerialization.jsonObject(with: data)
            guard let envelope = object as? [String: Any] else {
                throw validationError("INVALID_ENVELOPE", "Bridge request must be a JSON object")
            }
            try requireExactKeys(
                envelope,
                allowed: ["bridgeVersion", "correlationId", "type", "payload"],
                context: "envelope"
            )

            let bridgeVersion = try requireString(envelope["bridgeVersion"], field: "bridgeVersion")
            guard bridgeVersion == Self.bridgeVersion else {
                throw validationError("UNSUPPORTED_BRIDGE_VERSION", "Bridge version is not supported")
            }

            let correlationId = try requireIdentifier(envelope["correlationId"], field: "correlationId")
            let type = try requireString(envelope["type"], field: "type")
            guard let payload = envelope["payload"] as? [String: Any] else {
                throw validationError("INVALID_PAYLOAD", "Bridge payload must be a JSON object")
            }

            let requestPayload = try validatePayload(type: type, payload: payload)
            guard reserveCorrelationId(correlationId) else {
                throw validationError("DUPLICATE_CORRELATION_ID", "Bridge correlation ID was already used")
            }

            return .success(
                BridgeEnvelope(
                    bridgeVersion: bridgeVersion,
                    correlationId: correlationId,
                    type: type,
                    payload: requestPayload
                )
            )
        } catch let error as BridgeValidationError {
            return .failure(error)
        } catch {
            return .failure(validationError("INVALID_JSON", "Bridge request is not valid JSON"))
        }
    }

    private func validatePayload(type: String, payload: [String: Any]) throws -> BridgeRequestPayload {
        switch type {
        case "app.handshake":
            try requireExactKeys(payload, allowed: ["appVersion", "rendererBuildHash"], context: type)
            return .handshake(
                HandshakePayload(
                    appVersion: try requireString(payload["appVersion"], field: "appVersion"),
                    rendererBuildHash: try requireIdentifier(
                        payload["rendererBuildHash"],
                        field: "rendererBuildHash"
                    )
                )
            )
        case "file.select":
            try requireExactKeys(payload, allowed: ["multiple"], context: type)
            return .fileSelect(
                FileSelectPayload(multiple: try requireBoolean(payload["multiple"], field: "multiple"))
            )
        case "app.lifecycleAck":
            try requireExactKeys(payload, allowed: ["state"], context: type)
            let state = try requireString(payload["state"], field: "state")
            guard ["suspend", "prepare-close"].contains(state) else {
                throw validationError("INVALID_PAYLOAD", "Bridge lifecycle state is not supported")
            }
            return .lifecycleAck(LifecycleAckPayload(state: state))
        case "diagnostics.write":
            try requireKeys(
                payload,
                allowed: ["code", "operation", "errorCode", "durationMs", "contentHashPrefix"],
                required: ["code"],
                context: type
            )
            let operation = try optionalString(payload["operation"], field: "operation", maximumLength: 64)
            let errorCode = try optionalString(payload["errorCode"], field: "errorCode", maximumLength: 64)
            let durationMs = try optionalNonnegativeNumber(payload["durationMs"], field: "durationMs")
            let contentHashPrefix = try optionalString(
                payload["contentHashPrefix"],
                field: "contentHashPrefix",
                maximumLength: 16
            )
            return .diagnosticsWrite(
                DiagnosticsWritePayload(
                    code: try requireDiagnosticCode(payload["code"]),
                    operation: try requireDiagnosticOperation(operation),
                    errorCode: try requireDiagnosticCode(errorCode),
                    durationMs: durationMs,
                    contentHashPrefix: try requireHashPrefix(contentHashPrefix)
                )
            )
        default:
            throw validationError("UNKNOWN_REQUEST_TYPE", "Bridge request type is not supported")
        }
    }

    private func reserveCorrelationId(_ correlationId: String) -> Bool {
        correlationLock.lock()
        defer { correlationLock.unlock() }
        return correlationIds.insert(correlationId).inserted
    }
}

private func requireKeys(
    _ object: [String: Any],
    allowed: Set<String>,
    required: Set<String>,
    context: String
) throws {
    let keys = Set(object.keys)
    guard keys.isSubset(of: allowed), required.isSubset(of: keys) else {
        throw validationError("UNKNOWN_OR_MISSING_FIELD", "Bridge \(context) fields do not match the contract")
    }
}

private func requireDiagnosticCode(_ value: Any?) throws -> String {
    let code = try requireString(value, field: "code")
    guard
        code.range(
            of: #"^[A-Z][A-Z0-9_]{0,63}$"#,
            options: .regularExpression
        ) != nil
    else {
        throw validationError("INVALID_FIELD", "Bridge diagnostic code is invalid")
    }
    return code
}

private func requireDiagnosticCode(_ value: String?) throws -> String? {
    guard let value else { return nil }
    return try requireDiagnosticCode(value as Any)
}

private func requireDiagnosticOperation(_ value: String?) throws -> String? {
    guard let value else { return nil }
    let allowed = Set([
        "app.runtime",
        "bridge.dispatch",
        "library.refresh",
        "library.import.select",
        "library.open",
        "playback-resume.read",
        "renderer.load",
        "renderer.preload",
        "sidecar.read",
        "studio.open",
        "studio.preview",
        "viewer.operation",
    ])
    guard allowed.contains(value) else {
        throw validationError("INVALID_FIELD", "Bridge diagnostic operation is invalid")
    }
    return value
}

private func requireHashPrefix(_ value: String?) throws -> String? {
    guard let value else { return nil }
    guard
        value.range(
            of: #"^[a-f0-9]{8,16}$"#,
            options: .regularExpression
        ) != nil
    else {
        throw validationError("INVALID_FIELD", "Bridge contentHashPrefix is invalid")
    }
    return value
}

private func requireExactKeys(
    _ object: [String: Any],
    allowed: Set<String>,
    context: String
) throws {
    guard Set(object.keys) == allowed else {
        throw validationError("UNKNOWN_OR_MISSING_FIELD", "Bridge \(context) fields do not match the contract")
    }
}

private func requireString(_ value: Any?, field: String) throws -> String {
    guard let string = value as? String else {
        throw validationError("INVALID_FIELD", "Bridge \(field) must be a string")
    }
    return string
}

private func requireIdentifier(_ value: Any?, field: String) throws -> String {
    let string = try requireString(value, field: field)
    guard !string.isEmpty, string.utf16.count <= 128 else {
        throw validationError("FIELD_OUT_OF_RANGE", "Bridge \(field) is outside the allowed length")
    }
    return string
}

private func requireBoolean(_ value: Any?, field: String) throws -> Bool {
    guard
        let number = value as? NSNumber,
        CFGetTypeID(number) == CFBooleanGetTypeID()
    else {
        throw validationError("INVALID_FIELD", "Bridge \(field) must be a boolean")
    }
    return number.boolValue
}

private func optionalNonnegativeNumber(_ value: Any?, field: String) throws -> Double? {
    guard let value else { return nil }
    guard
        let number = value as? NSNumber,
        CFGetTypeID(number) != CFBooleanGetTypeID(),
        number.doubleValue >= 0
    else {
        throw validationError("FIELD_OUT_OF_RANGE", "Bridge \(field) must be a nonnegative number")
    }
    return number.doubleValue
}

private func optionalString(
    _ value: Any?,
    field: String,
    maximumLength: Int
) throws -> String? {
    guard let value else { return nil }
    let string = try requireString(value, field: field)
    guard string.utf16.count <= maximumLength else {
        throw validationError("FIELD_OUT_OF_RANGE", "Bridge \(field) is outside the allowed length")
    }
    return string
}

private func validationError(_ code: String, _ message: String) -> BridgeValidationError {
    BridgeValidationError(code: code, message: message)
}
