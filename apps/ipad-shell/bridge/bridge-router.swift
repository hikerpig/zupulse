import Foundation
import WebKit

final class BridgeRouter {
    private static let bridgeVersion = "3.0.0"
    private let appVersion: String
    private let rendererBuildHash: String
    private let validator = BridgeContractValidator()
    private let fileSelector: DocumentPicking?
    private let fileTokens: FileTokenStore
    private let lifecycleCoordinator: LifecycleCoordinator?
    private let diagnosticLogger: DiagnosticLogger?

    init(
        appVersion: String,
        rendererBuildHash: String,
        fileSelector: DocumentPicking? = nil,
        fileTokens: FileTokenStore = FileTokenStore(),
        lifecycleCoordinator: LifecycleCoordinator? = nil,
        diagnosticLogger: DiagnosticLogger? = nil
    ) {
        self.appVersion = appVersion
        self.rendererBuildHash = rendererBuildHash
        self.fileSelector = fileSelector
        self.fileTokens = fileTokens
        self.lifecycleCoordinator = lifecycleCoordinator
        self.diagnosticLogger = diagnosticLogger
    }

    static func load(
        bundle: Bundle = .main,
        fileSelector: DocumentPicking? = nil,
        fileTokens: FileTokenStore = FileTokenStore(),
        lifecycleCoordinator: LifecycleCoordinator? = nil,
        diagnosticLogger: DiagnosticLogger? = nil
    ) throws -> BridgeRouter {
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
        return BridgeRouter(
            appVersion: appVersion,
            rendererBuildHash: buildHash,
            fileSelector: fileSelector,
            fileTokens: fileTokens,
            lifecycleCoordinator: lifecycleCoordinator,
            diagnosticLogger: diagnosticLogger
        )
    }

    func handleFileRequest(_ value: Any) async -> Result<[String: Any], BridgeValidationError> {
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
        let envelope: BridgeEnvelope
        switch validator.validate(data) {
        case let .failure(error):
            return .failure(error)
        case let .success(validated):
            envelope = validated
        }
        guard let fileSelector else {
            return .failure(
                BridgeValidationError(
                    code: "FILE_PICKER_UNAVAILABLE",
                    message: "File picker is unavailable",
                    recoverable: true
                )
            )
        }

        do {
            guard case let .fileSelect(payload) = envelope.payload else {
                return .failure(
                    BridgeValidationError(
                        code: "BRIDGE_HANDLER_UNAVAILABLE",
                        message: "Bridge request handler is unavailable"
                    )
                )
            }
            let multiple = payload.multiple
            guard let selectedURLs = try await fileSelector.select(multiple: multiple), !selectedURLs.isEmpty else {
                return .success(responseEnvelope(envelope, payload: ["status": "cancelled"]))
            }
            guard multiple || selectedURLs.count == 1 else {
                throw documentRouteError("FILE_SELECTION_INVALID")
            }
            let metadata = try selectedURLs.map { try validateSelectedFile($0) }
            let tokens = try await fileTokens.issueBatch(
                metadata.map {
                    FileTokenEntry(url: $0.url, fileName: $0.fileName, sizeBytes: $0.sizeBytes)
                }
            )
            let files: [[String: Any]] = zip(metadata, tokens).map { file, token in
                [
                    "fileToken": token,
                    "fileName": file.fileName,
                    "sizeBytes": file.sizeBytes,
                ]
            }
            #if DEBUG
            await MainActor.run {
                UITestImportStage.shared.value = "TOKEN_ISSUED"
            }
            #endif
            return .success(
                responseEnvelope(
                    envelope,
                    payload: ["status": "selected", "files": files]
                )
            )
        } catch {
            let code = documentRouteErrorCode(error)
            return .failure(
                BridgeValidationError(
                    code: code,
                    message: "The selected file cannot be imported",
                    recoverable: true
                )
            )
        }
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
        if case let .diagnosticsWrite(payload) = envelope.payload {
            diagnosticLogger?.record(
                code: payload.code,
                durationMs: payload.durationMs,
                contentHashPrefix: payload.contentHashPrefix
            )
            return .success(responseEnvelope(envelope, payload: [:]))
        }
        if case let .lifecycleAck(payload) = envelope.payload {
            guard let state = LifecycleState(rawValue: payload.state) else {
                return .failure(
                    BridgeValidationError(
                        code: "INVALID_PAYLOAD",
                        message: "Bridge lifecycle state is not supported"
                    )
                )
            }
            _ = lifecycleCoordinator?.acknowledge(state)
            return .success(responseEnvelope(envelope, payload: [:]))
        }
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
                "locale": [
                    "preference": "system",
                    "effectiveLocale": "zh-CN",
                ],
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
        "localization": [
            "changeLocale": false,
        ],
    ]

    private func responseEnvelope(
        _ envelope: BridgeEnvelope,
        payload: [String: Any]
    ) -> [String: Any] {
        [
            "bridgeVersion": Self.bridgeVersion,
            "correlationId": envelope.correlationId,
            "type": envelope.type,
            "payload": payload,
        ]
    }
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
        if
            let body = message.body as? [String: Any],
            let type = body["type"] as? String,
            ["file.select"].contains(type)
        {
            #if DEBUG
            UITestImportStage.shared.value = "REQUEST_RECEIVED"
            #endif
            Task { @MainActor in
                switch await router.handleFileRequest(body) {
                case let .success(response):
                    replyHandler(response, nil)
                case let .failure(error):
                    replyHandler(nil, error.code)
                }
            }
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

private func documentRouteError(_ code: String) -> NSError {
    NSError(
        domain: "com.hikerpig.zupulse.document-route",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: code]
    )
}

private func documentRouteErrorCode(_ error: Error) -> String {
    let error = error as NSError
    let trustedDomains = [
        "com.hikerpig.zupulse.document-picker",
        "com.hikerpig.zupulse.document-route",
        "com.hikerpig.zupulse.file-token",
    ]
    guard trustedDomains.contains(error.domain) else {
        return "FILE_SELECTION_INVALID"
    }
    return error.localizedDescription
}
