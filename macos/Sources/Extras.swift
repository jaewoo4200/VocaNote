import Cocoa
import AVFoundation
import Carbon.HIToolbox
import ApplicationServices

// ============================================================================
// 발음(TTS) · 최근 검색 · 선택 단어 조회 · 클립보드 감시 헬퍼
// ============================================================================

/// 영어 발음 재생 (AVSpeechSynthesizer).
final class Speaker {
    static let shared = Speaker()
    private let synth = AVSpeechSynthesizer()

    func speak(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let u = AVSpeechUtterance(string: clean)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        u.rate = 0.46
        synth.speak(u)
    }
}

/// 최근 검색어 (UserDefaults, 최대 12개).
final class RecentStore {
    static let shared = RecentStore()
    private let key = "recent.searches"
    private let cap = 12

    func list() -> [String] { UserDefaults.standard.stringArray(forKey: key) ?? [] }

    func push(_ term: String) {
        let t = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        var arr = list().filter { $0.caseInsensitiveCompare(t) != .orderedSame }
        arr.insert(t, at: 0)
        if arr.count > cap { arr = Array(arr.prefix(cap)) }
        UserDefaults.standard.set(arr, forKey: key)
    }

    func clear() { UserDefaults.standard.removeObject(forKey: key) }
}

/// 다른 앱에서 드래그로 선택한 단어를 ⌘C 시뮬레이션으로 가져오기.
/// (Accessibility 권한이 있으면 실제 복사, 없으면 현재 클립보드로 폴백)
enum SelectionLookup {
    static var isTrusted: Bool { AXIsProcessTrusted() }

    static func requestPermissionPrompt() {
        let opt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([opt: true] as CFDictionary)
    }

    /// 선택 영역을 복사해 첫 단어를 반환. 원래 클립보드는 복원.
    static func grab(_ completion: @escaping (String?) -> Void) {
        let pb = NSPasteboard.general
        let saved = pb.string(forType: .string)
        let beforeCount = pb.changeCount
        simulateCopy()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
            let copied = (pb.changeCount != beforeCount) ? pb.string(forType: .string) : saved
            // 원래 클립보드 복원 (선택 복사가 실제로 일어났을 때만)
            if pb.changeCount != beforeCount {
                pb.clearContents()
                if let s = saved { pb.setString(s, forType: .string) }
            }
            completion(firstWord(copied))
        }
    }

    private static func simulateCopy() {
        let src = CGEventSource(stateID: .combinedSessionState)
        let down = CGEvent(keyboardEventSource: src, virtualKey: CGKeyCode(kVK_ANSI_C), keyDown: true)
        let up   = CGEvent(keyboardEventSource: src, virtualKey: CGKeyCode(kVK_ANSI_C), keyDown: false)
        down?.flags = .maskCommand
        up?.flags = .maskCommand
        down?.post(tap: .cgAnnotatedSessionEventTap)
        up?.post(tap: .cgAnnotatedSessionEventTap)
    }

    static func firstWord(_ raw: String?) -> String? {
        guard let raw = raw else { return nil }
        let token = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .whitespacesAndNewlines).first ?? ""
        let trimmed = token.trimmingCharacters(in: CharacterSet(charactersIn: ".,;:!?()[]{}\"'`<>…"))
        return trimmed.isEmpty ? nil : String(trimmed.prefix(40))
    }
}

/// 클립보드 감시 — 새로 복사된 짧은 영어 단어를 자동 조회.
final class ClipboardWatcher {
    static let shared = ClipboardWatcher()
    private var timer: Timer?
    private var lastCount = NSPasteboard.general.changeCount
    var onWord: ((String) -> Void)?

    private let defaultsKey = "clipboard.watch"
    var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: defaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKey); newValue ? start() : stop() }
    }

    func startIfEnabled() { if enabled { start() } }

    private func start() {
        stop()
        lastCount = NSPasteboard.general.changeCount
        let t = Timer(timeInterval: 0.6, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stop() { timer?.invalidate(); timer = nil }

    private func tick() {
        let pb = NSPasteboard.general
        guard pb.changeCount != lastCount else { return }
        lastCount = pb.changeCount
        guard let raw = pb.string(forType: .string) else { return }
        let word = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // 한 단어 · 영문 위주 · 너무 길지 않게 (문장/코드 복사엔 반응 안 함)
        guard word.count <= 32,
              !word.contains(" "), !word.contains("\n"),
              word.range(of: "^[A-Za-z][A-Za-z\\-']*$", options: .regularExpression) != nil
        else { return }
        onWord?(word)
    }
}
