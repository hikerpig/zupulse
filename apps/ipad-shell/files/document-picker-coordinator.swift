import Foundation
import UIKit
import UniformTypeIdentifiers

protocol DocumentPicking: Sendable {
    @MainActor
    func select(multiple: Bool) async throws -> [URL]?
}

#if DEBUG
struct BundledFixtureDocumentPicker: DocumentPicking {
    let bundle: Bundle
    let resourceName: String

    @MainActor
    func select(multiple: Bool) async throws -> [URL]? {
        UITestImportStage.shared.value = "SELECTED"
        guard
            let separator = resourceName.lastIndex(of: "."),
            let url = bundle.url(
                forResource: String(resourceName[..<separator]),
                withExtension: String(resourceName[resourceName.index(after: separator)...])
            )
        else {
            throw documentPickerError("UI_TEST_FIXTURE_UNAVAILABLE")
        }
        return [url]
    }
}

func bundledFixtureDocumentPicker(
    bundle: Bundle = .main,
    environment: [String: String] = ProcessInfo.processInfo.environment
) -> (any DocumentPicking)? {
    guard let resourceName = environment["ZUPULSE_UI_TEST_FIXTURE"] else {
        return nil
    }
    guard !resourceName.contains("/"), !resourceName.contains("\\") else {
        return nil
    }
    return BundledFixtureDocumentPicker(bundle: bundle, resourceName: resourceName)
}
#endif

@MainActor
final class DocumentPickerCoordinator: NSObject, DocumentPicking, UIDocumentPickerDelegate {
    private let presenter: @MainActor () -> UIViewController?
    private var continuation: CheckedContinuation<[URL]?, Error>?
    private var picker: UIDocumentPickerViewController?

    init(presenter: @escaping @MainActor () -> UIViewController?) {
        self.presenter = presenter
    }

    func select(multiple: Bool) async throws -> [URL]? {
        guard continuation == nil else {
            throw documentPickerError("FILE_PICKER_BUSY")
        }
        guard let presenter = presenter() else {
            throw documentPickerError("FILE_PICKER_UNAVAILABLE")
        }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: false)
            picker.allowsMultipleSelection = multiple
            picker.delegate = self
            self.picker = picker
            presenter.present(picker, animated: true)
        }
    }

    func documentPicker(
        _ controller: UIDocumentPickerViewController,
        didPickDocumentsAt urls: [URL]
    ) {
        finish(urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(nil)
    }

    private func finish(_ urls: [URL]?) {
        let continuation = continuation
        self.continuation = nil
        picker = nil
        continuation?.resume(returning: urls)
    }
}

struct SelectedFileMetadata {
    let url: URL
    let fileName: String
    let sizeBytes: Int
}

func validateSelectedFile(_ url: URL) throws -> SelectedFileMetadata {
    let fileName = url.lastPathComponent
    let allowedExtensions = ["gp3", "gp4", "gp5", "gpx", "gp", "musicxml", "mxl"]
    let attributes: [FileAttributeKey: Any]
    do {
        attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    } catch {
        throw documentPickerError("FILE_SELECTION_INVALID")
    }
    guard attributes[.type] as? FileAttributeType == .typeRegular else {
        throw documentPickerError("FILE_SELECTION_INVALID")
    }
    guard allowedExtensions.contains(url.pathExtension.lowercased()) else {
        throw documentPickerError("FILE_TYPE_UNSUPPORTED")
    }
    guard let sizeNumber = attributes[.size] as? NSNumber else {
        throw documentPickerError("FILE_SELECTION_INVALID")
    }
    let sizeBytes = sizeNumber.intValue
    guard sizeBytes <= maximumScoreFileBytes else {
        throw documentPickerError("FILE_TOO_LARGE")
    }
    return SelectedFileMetadata(url: url, fileName: fileName, sizeBytes: sizeBytes)
}

private func documentPickerError(_ code: String) -> NSError {
    NSError(
        domain: "com.hikerpig.zupulse.document-picker",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: code]
    )
}
