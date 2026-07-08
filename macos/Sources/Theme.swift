import SwiftUI
import AppKit

// 웹(src/styles.css)과 동일한 디자인 토큰 — 라이트/다크 자동 대응.
private func vhex(_ s: String) -> NSColor {
    var h = s; if h.hasPrefix("#") { h.removeFirst() }
    let v = UInt64(h, radix: 16) ?? 0
    return NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255,
                   green: CGFloat((v >> 8) & 0xff) / 255,
                   blue: CGFloat(v & 0xff) / 255, alpha: 1)
}
private func dyn(_ light: String, _ dark: String) -> Color {
    Color(nsColor: NSColor(name: nil) { app in
        app.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? vhex(dark) : vhex(light)
    })
}

enum VocaTheme {
    static let bg           = dyn("#f4f5f7", "#0b0d11")
    static let surface      = dyn("#ffffff", "#14171d")
    static let surfaceSoft  = dyn("#f1f2f5", "#1a1e26")
    static let surfaceStrong = dyn("#e6e8ec", "#242a34")
    static let text         = dyn("#181b21", "#e9ecf2")
    static let textMuted    = dyn("#6b7280", "#98a1b2")
    static let brand        = dyn("#0f8377", "#2dd4bf")
    static let brandStrong  = dyn("#0a6258", "#5eead4")
    static let brandSoft    = dyn("#d8efeb", "#103a36")
    static let danger       = dyn("#dc2626", "#fb7185")
    static let border       = dyn("#e7e9ed", "#262c37")

    // 라운딩(웹: --r-sm/md/lg)
    static let rSm: CGFloat = 8
    static let rMd: CGFloat = 10
    static let rLg: CGFloat = 14
}

extension View {
    /// 패널/창 배경 — 뒤에 무엇이 오든(밝은/어두운 배경, 다크모드) 글자 대비를 보장.
    /// 반투명 재질 위에 **불투명 테마 서피스(85%)**를 얹어, 뒤 배경 색이 대비를 망치지 못하게 한다.
    /// (예전 .ultraThinMaterial 단독은 어두운 배경이 비쳐 밝은 모드에서 검은 글자가 안 보였음)
    func vocaSurfaceBackground() -> some View {
        background(
            ZStack {
                Rectangle().fill(.regularMaterial)
                Rectangle().fill(VocaTheme.surface.opacity(0.85))
            }
        )
    }
}
