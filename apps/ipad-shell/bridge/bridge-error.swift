import Foundation

struct BridgeValidationError: Codable, Error, Equatable {
    let code: String
    let message: String
    let recoverable: Bool

    init(code: String, message: String) {
        self.code = code
        self.message = message
        recoverable = false
    }
}
