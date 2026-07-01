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
