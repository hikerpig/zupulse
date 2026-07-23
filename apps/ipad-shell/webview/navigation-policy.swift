import Foundation
import WebKit

enum NavigationPolicyDecision: Equatable {
    case allow
    case cancel
    case openExternally(URL)
}

struct NavigationPolicy {
    func decide(
        url: URL?,
        isMainFrame: Bool,
        isUserInitiated: Bool
    ) -> NavigationPolicyDecision {
        guard let url else { return .cancel }
        if
            url.scheme == AppResourceSchemeHandler.scheme,
            url.host == AppResourceSchemeHandler.host,
            url.user == nil,
            url.password == nil,
            url.port == nil
        {
            return .allow
        }
        guard
            isMainFrame,
            isUserInitiated,
            url.scheme == "https",
            url.host != nil
        else {
            return .cancel
        }
        return .openExternally(url)
    }
}

extension WKNavigationAction {
    var zupulseIsUserInitiated: Bool {
        navigationType == .linkActivated
    }
}
