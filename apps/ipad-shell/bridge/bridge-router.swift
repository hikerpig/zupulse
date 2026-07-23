import Foundation
import WebKit

final class BridgeRouter {
    private static let bridgeVersion = "3.0.0"
    private let appVersion: String
    private let rendererBuildHash: String
    private let validator = BridgeContractValidator()

    init(appVersion: String, rendererBuildHash: String) {
        self.appVersion = appVersion
        self.rendererBuildHash = rendererBuildHash
    }

    static func load(bundle: Bundle = .main) throws -> BridgeRouter {
        guard
            let appVersion = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
            let manifestURL = bundle.url(
                forResource: "asset-manifest",
                withExtension: "json",
                subdirectory: "Web"
            )
        else {
            throw BridgeValidationError(
                code: "BRIDGE_CONFIGURATION_MISSING",
                message: "Bridge build metadata is unavailable"
            )
        }
        let data = try Data(contentsOf: manifestURL)
        guard
            let manifest = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            manifest["appVersion"] as? String == appVersion,
            manifest["bridgeVersion"] as? String == bridgeVersion,
            let buildHash = manifest["buildHash"] as? String,
            !buildHash.isEmpty
        else {
            throw BridgeValidationError(
                code: "BRIDGE_CONFIGURATION_MISMATCH",
                message: "Native and Web build metadata do not match"
            )
        }
        return BridgeRouter(appVersion: appVersion, rendererBuildHash: buildHash)
    }

    func handle(_ value: Any) -> Result<[String: Any], BridgeValidationError> {
        let data: Data
        do {
            data = try JSONSerialization.data(withJSONObject: value)
        } catch {
            return .failure(
                BridgeValidationError(
                    code: "INVALID_JSON",
                    message: "Bridge request is not valid JSON"
                )
            )
        }

        switch validator.validate(data) {
        case let .failure(error):
            return .failure(error)
        case let .success(envelope):
            return route(envelope)
        }
    }

    private func route(_ envelope: BridgeEnvelope) -> Result<[String: Any], BridgeValidationError> {
        guard case let .handshake(payload) = envelope.payload else {
            return .failure(
                BridgeValidationError(
                    code: "BRIDGE_HANDLER_UNAVAILABLE",
                    message: "Bridge request handler is unavailable"
                )
            )
        }
        guard
            payload.appVersion == appVersion,
            payload.rendererBuildHash == rendererBuildHash
        else {
            return .failure(
                BridgeValidationError(
                    code: "BRIDGE_BUILD_MISMATCH",
                    message: "Native and Web build metadata do not match"
                )
            )
        }

        return .success([
            "bridgeVersion": Self.bridgeVersion,
            "correlationId": envelope.correlationId,
            "type": envelope.type,
            "payload": [
                "appVersion": appVersion,
                "bridgeVersion": Self.bridgeVersion,
                "rendererBuildHash": rendererBuildHash,
                "capabilities": Self.capabilities,
            ],
        ])
    }

    private static let capabilities: [String: Any] = [
        "fileAccess": [
            "openExternalFile": true,
            "persistentFileReferences": false,
            "localLibraryImport": true,
        ],
        "storage": [
            "sqliteIndex": false,
            "sidecarPayload": false,
        ],
        "sync": [
            "available": false,
            "provider": "none",
        ],
        "audio": [
            "webAudio": true,
            "nativeBridge": false,
        ],
    ]
}

final class BridgeMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "zupulseBridge"

    private let router: BridgeRouter?

    init(router: BridgeRouter?) {
        self.router = router
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let router else {
            replyHandler(nil, "BRIDGE_CONFIGURATION_MISSING")
            return
        }
        switch router.handle(message.body) {
        case let .success(response):
            replyHandler(response, nil)
        case let .failure(error):
            replyHandler(nil, error.code)
        }
    }
}
