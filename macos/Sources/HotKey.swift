import Cocoa
import Carbon.HIToolbox

/// 전역 단축키 등록/변경(녹화)/영속화 관리.
///  • id 1 = 검색 패널 토글
///  • id 2 = 선택한 단어 바로 조회
final class HotKeyManager {
    static let shared = HotKeyManager()

    var onTrigger: (() -> Void)?   // 검색 패널
    var onLookup: (() -> Void)?    // 선택 단어 조회

    private var ref: EventHotKeyRef?
    private var lookupRef: EventHotKeyRef?
    private var recordMonitor: Any?

    // 검색 패널 단축키 (기본 ⌥Space)
    private let kKey = "hotkey.keyCode"
    private let kMod = "hotkey.carbonMods"
    private let kDisp = "hotkey.display"
    // 선택 단어 조회 단축키 (기본 ⌃⌥Space)
    private let kLKey = "lookup.keyCode"
    private let kLMod = "lookup.carbonMods"
    private let kLDisp = "lookup.display"

    var keyCode: UInt32 { UInt32(UserDefaults.standard.object(forKey: kKey) as? Int ?? Int(kVK_Space)) }
    var carbonMods: UInt32 { UInt32(UserDefaults.standard.object(forKey: kMod) as? Int ?? optionKey) }
    var display: String { UserDefaults.standard.string(forKey: kDisp) ?? "⌥Space" }

    var lookupKeyCode: UInt32 { UInt32(UserDefaults.standard.object(forKey: kLKey) as? Int ?? Int(kVK_Space)) }
    var lookupMods: UInt32 { UInt32(UserDefaults.standard.object(forKey: kLMod) as? Int ?? (controlKey | optionKey)) }
    var lookupDisplay: String { UserDefaults.standard.string(forKey: kLDisp) ?? "⌃⌥Space" }

    // 앱 시작 시 1회
    func installHandler() {
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: OSType(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { (_, event, _) -> OSStatus in
            var hkid = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject),
                              EventParamType(typeEventHotKeyID), nil,
                              MemoryLayout<EventHotKeyID>.size, nil, &hkid)
            let id = hkid.id
            DispatchQueue.main.async {
                if id == 2 { HotKeyManager.shared.onLookup?() }
                else { HotKeyManager.shared.onTrigger?() }
            }
            return noErr
        }, 1, &type, nil, nil)
    }

    func register() {
        // 패널 토글
        if let r = ref { UnregisterEventHotKey(r); ref = nil }
        var r1: EventHotKeyRef?
        RegisterEventHotKey(keyCode, carbonMods,
                            EventHotKeyID(signature: OSType(0x564E4F54), id: 1),  // 'VNOT'
                            GetApplicationEventTarget(), 0, &r1)
        ref = r1

        // 선택 단어 조회
        if let r = lookupRef { UnregisterEventHotKey(r); lookupRef = nil }
        var r2: EventHotKeyRef?
        RegisterEventHotKey(lookupKeyCode, lookupMods,
                            EventHotKeyID(signature: OSType(0x564E4F54), id: 2),
                            GetApplicationEventTarget(), 0, &r2)
        lookupRef = r2
    }

    // MARK: 녹화 — 다음 (수정키+키) 조합을 캡처
    enum Target { case panel, lookup }

    func startRecording(_ target: Target = .panel, _ completion: @escaping (String) -> Void) {
        stopRecording()
        recordMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return event }
            let carbon = self.carbonFlags(event.modifierFlags)
            let hasReal = carbon & UInt32(cmdKey | optionKey | controlKey) != 0
            if event.keyCode == 53 {  // esc = 취소
                self.stopRecording()
                completion(target == .lookup ? self.lookupDisplay : self.display)
                return nil
            }
            guard hasReal else { return nil }  // ⌘/⌥/⌃ 없으면 계속 녹화
            let disp = HotKeyManager.displayString(keyCode: UInt32(event.keyCode), carbonMods: carbon,
                                                   chars: event.charactersIgnoringModifiers)
            let keys: (String, String, String) = target == .lookup
                ? (self.kLKey, self.kLMod, self.kLDisp)
                : (self.kKey, self.kMod, self.kDisp)
            UserDefaults.standard.set(Int(event.keyCode), forKey: keys.0)
            UserDefaults.standard.set(Int(carbon), forKey: keys.1)
            UserDefaults.standard.set(disp, forKey: keys.2)
            self.register()
            self.stopRecording()
            completion(disp)
            return nil
        }
    }

    func stopRecording() {
        if let m = recordMonitor { NSEvent.removeMonitor(m); recordMonitor = nil }
    }

    private func carbonFlags(_ f: NSEvent.ModifierFlags) -> UInt32 {
        var m: UInt32 = 0
        if f.contains(.command) { m |= UInt32(cmdKey) }
        if f.contains(.option)  { m |= UInt32(optionKey) }
        if f.contains(.control) { m |= UInt32(controlKey) }
        if f.contains(.shift)   { m |= UInt32(shiftKey) }
        return m
    }

    static func displayString(keyCode: UInt32, carbonMods: UInt32, chars: String?) -> String {
        var s = ""
        if carbonMods & UInt32(controlKey) != 0 { s += "⌃" }
        if carbonMods & UInt32(optionKey)  != 0 { s += "⌥" }
        if carbonMods & UInt32(shiftKey)   != 0 { s += "⇧" }
        if carbonMods & UInt32(cmdKey)     != 0 { s += "⌘" }
        s += keyName(keyCode, chars: chars)
        return s
    }

    static func keyName(_ code: UInt32, chars: String?) -> String {
        switch Int(code) {
        case kVK_Space: return "Space"
        case kVK_Return, kVK_ANSI_KeypadEnter: return "↵"
        case kVK_Tab: return "⇥"
        case 126: return "↑"; case 125: return "↓"; case 123: return "←"; case 124: return "→"
        case kVK_F1: return "F1"; case kVK_F2: return "F2"; case kVK_F3: return "F3"
        default:
            if let c = chars, !c.isEmpty, c != " " { return c.uppercased() }
            return "Key\(code)"
        }
    }
}
