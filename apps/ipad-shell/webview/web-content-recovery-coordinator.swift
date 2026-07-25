import Foundation

@MainActor
final class WebContentRecoveryCoordinator<Content: AnyObject> {
    private(set) var activeContent: Content
    private(set) var replacementCount = 0
    private let makeReplacement: () -> Content
    private let install: (Content) -> Void

    init(
        initialContent: Content,
        makeReplacement: @escaping () -> Content,
        install: @escaping (Content) -> Void
    ) {
        activeContent = initialContent
        self.makeReplacement = makeReplacement
        self.install = install
    }

    func contentProcessDidTerminate(_ content: Content) {
        guard content === activeContent else { return }
        let replacement = makeReplacement()
        activeContent = replacement
        replacementCount += 1
        install(replacement)
    }
}
