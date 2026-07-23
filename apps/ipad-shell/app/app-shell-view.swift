import SwiftUI

struct AppShellView: View {
    private let webEntryURL = Bundle.main.url(
        forResource: "index",
        withExtension: "html",
        subdirectory: "Web"
    )

    var body: some View {
        Group {
            if let webEntryURL {
                WebViewContainer(entryURL: webEntryURL)
                    .ignoresSafeArea()
            } else {
                ContentUnavailableView(
                    "无法启动逐拍",
                    systemImage: "exclamationmark.triangle",
                    description: Text("应用内的 Web 资源缺失，请重新构建。")
                )
            }
        }
    }
}
