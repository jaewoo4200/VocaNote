import AppKit

// 1024x1024 앱 아이콘 PNG를 렌더 (웹 icon.svg 디자인 재현: 틸 그라데이션 + 흰 V + 액센트)
// 사용: swiftc make_icon.swift -o make_icon && ./make_icon <출력.png>

func hexColor(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> CGColor {
    CGColor(srgbRed: r, green: g, blue: b, alpha: a)
}

let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon_1024.png"
let px = 1024
let unit = CGFloat(px) / 64.0   // 디자인은 64pt 기준

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { exit(1) }

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

// top-left origin, y-down, 64-unit 좌표
ctx.translateBy(x: 0, y: CGFloat(px))
ctx.scaleBy(x: unit, y: -unit)

// 배경 라운드 사각형 + 그라데이션
let bg = CGPath(roundedRect: CGRect(x: 0, y: 0, width: 64, height: 64), cornerWidth: 15, cornerHeight: 15, transform: nil)
ctx.saveGState()
ctx.addPath(bg); ctx.clip()
let cs = CGColorSpaceCreateDeviceRGB()
let grad = CGGradient(colorsSpace: cs,
                      colors: [hexColor(0.098, 0.710, 0.639), hexColor(0.039, 0.384, 0.345)] as CFArray,
                      locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 64, y: 64), options: [])

// 상단 하이라이트
let hi = CGPath(roundedRect: CGRect(x: 0, y: 0, width: 64, height: 32), cornerWidth: 15, cornerHeight: 15, transform: nil)
ctx.addPath(hi); ctx.setFillColor(hexColor(1, 1, 1, 0.10)); ctx.fillPath()
ctx.restoreGState()

// V 획
let v = CGMutablePath()
v.move(to: CGPoint(x: 20, y: 21))
v.addLine(to: CGPoint(x: 31.2, y: 43))
v.addLine(to: CGPoint(x: 32.8, y: 43))
v.addLine(to: CGPoint(x: 44, y: 21))
ctx.addPath(v)
ctx.setStrokeColor(hexColor(1, 1, 1))
ctx.setLineWidth(5.5)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.strokePath()

// 하단 북마크 바
let bar = CGPath(roundedRect: CGRect(x: 24, y: 49, width: 16, height: 3), cornerWidth: 1.5, cornerHeight: 1.5, transform: nil)
ctx.addPath(bar); ctx.setFillColor(hexColor(1, 1, 1, 0.55)); ctx.fillPath()

// 액센트 점
ctx.setFillColor(hexColor(0.608, 0.957, 0.906))
ctx.fillEllipse(in: CGRect(x: 44 - 3.4, y: 21 - 3.4, width: 6.8, height: 6.8))

NSGraphicsContext.restoreGraphicsState()

guard let data = rep.representation(using: .png, properties: [:]) else { exit(1) }
do {
    try data.write(to: URL(fileURLWithPath: outPath))
    print("wrote \(outPath)")
} catch { print("write failed: \(error)"); exit(1) }
