import SwiftUI
import ServiceManagement

// 설정/단어장 창을 닫으면 메인 검색 패널로 복귀.
extension Notification.Name { static let vocaReturnToPanel = Notification.Name("VocaReturnToPanel") }

final class SettingsWindow {
    static let shared = SettingsWindow()
    private var window: NSWindow?
    private var returnToPanel = false   // 검색 패널에서 열었을 때만 닫을 때 패널 복귀

    func show(returnToPanel: Bool = false) {
        self.returnToPanel = returnToPanel
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 470, height: 620),
                             styleMask: [.titled, .closable], backing: .buffered, defer: false)
            w.title = "VocaNote 설정"
            w.isReleasedWhenClosed = false
            w.center()
            w.contentView = NSHostingView(rootView: SettingsView())
            NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: w, queue: .main) { [weak self] _ in
                guard let self = self, self.returnToPanel else { return }
                self.returnToPanel = false
                NotificationCenter.default.post(name: .vocaReturnToPanel, object: nil)
            }
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}

struct SettingsView: View {
    @State private var hotkey = HotKeyManager.shared.display
    @State private var lookupHotkey = HotKeyManager.shared.lookupDisplay
    @State private var recording: HotKeyManager.Target?
    @State private var launchAtLogin = SettingsView.loginEnabled()
    @State private var clipboardWatch = ClipboardWatcher.shared.enabled

    @ObservedObject private var sync = SyncManager.shared
    @State private var syncEmail = ""
    @State private var otpSent = false
    @State private var otpCode = ""
    @State private var authBusy = false
    @State private var authError = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("설정").font(.title2).bold().tracking(-0.3)

            section("단축키", icon: "keyboard") {
                hotkeyRow(title: "검색 패널", value: hotkey, target: .panel)
                hotkeyRow(title: "선택 단어 조회", value: lookupHotkey, target: .lookup)
                Text("‘선택 단어 조회’는 다른 앱(PDF·브라우저)에서 단어를 드래그한 뒤 단축키를 누르면 바로 뜻을 띄웁니다. 최초 1회 손쉬운 사용(Accessibility) 권한이 필요해요.")
                    .font(.caption).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
            }

            section("일반", icon: "slider.horizontal.3") {
                Toggle("복사한 단어 자동 조회 (클립보드 감시)", isOn: $clipboardWatch)
                    .onChange(of: clipboardWatch) { _, on in ClipboardWatcher.shared.enabled = on }
                Toggle("로그인 시 자동 실행", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, on in SettingsView.setLogin(on) }
                Button("사용법 다시 보기") {
                    NotificationCenter.default.post(name: .vocaShowTutorial, object: nil)
                }.font(.caption)
            }

            section("동기화", icon: "arrow.triangle.2.circlepath") {
                syncSection
            }

            Spacer()
            Text("VocaNote \(Self.appVersion) · Jaewoo Lee")
                .font(.caption2).foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(20)
        .frame(width: 470, height: 620)
    }

    // 인셋 카드 섹션 — 시스템 설정/Linear 스타일의 그룹핑
    @ViewBuilder
    private func section<C: View>(_ title: String, icon: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundColor(.vocaBrand)
                Text(title).font(.system(size: 11.5, weight: .semibold)).foregroundColor(.secondary)
            }
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: VocaTheme.rMd).fill(Color.primary.opacity(0.035)))
        .overlay(RoundedRectangle(cornerRadius: VocaTheme.rMd).strokeBorder(VocaTheme.border.opacity(0.6)))
    }

    static var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        return "v\(v)"
    }

    @ViewBuilder private var syncSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("voca.ljw.app · 웹/폰과 같은 계정으로 단어장 자동 동기화")
                .font(.caption).foregroundColor(.secondary)

            if !sync.isConfigured {
                Text("이 빌드에 Supabase 설정이 없습니다. (.env.local 확인)")
                    .font(.caption).foregroundColor(.secondary)
            } else if sync.isSignedIn {
                HStack {
                    Image(systemName: "checkmark.seal.fill").foregroundColor(.vocaBrand)
                    Text(sync.email.isEmpty ? "로그인됨" : sync.email).font(.system(size: 13))
                    Spacer()
                    Button("로그아웃") { sync.signOut() }.font(.caption)
                }
                HStack(spacing: 8) {
                    Button { Task { await sync.syncNow() } } label: {
                        Label("지금 동기화", systemImage: "arrow.triangle.2.circlepath")
                    }.disabled(sync.syncing)
                    if sync.syncing { ProgressView().controlSize(.small) }
                    Text(sync.status).font(.caption).foregroundColor(.secondary).lineLimit(1)
                }
            } else {
                if !otpSent {
                    HStack(spacing: 8) {
                        TextField("이메일", text: $syncEmail).textFieldStyle(.roundedBorder)
                        Button("코드 받기") { sendCode() }.disabled(authBusy || syncEmail.isEmpty)
                    }
                } else {
                    HStack(spacing: 8) {
                        TextField("메일로 온 8자리 코드", text: $otpCode).textFieldStyle(.roundedBorder)
                        Button("확인") { verifyCode() }.disabled(authBusy || otpCode.isEmpty)
                        Button("취소") { otpSent = false; otpCode = ""; authError = "" }.font(.caption)
                    }
                }
                if authBusy { ProgressView().controlSize(.small) }
                if !authError.isEmpty {
                    Text(authError).font(.caption).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
                }
                Text("웹/폰과 같은 이메일로 로그인하면 단어장이 자동 동기화됩니다.")
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
    }

    private func sendCode() {
        authBusy = true; authError = ""
        let email = syncEmail
        Task {
            do {
                try await sync.sendOtp(email)
                await MainActor.run { otpSent = true; authBusy = false }
            } catch {
                await MainActor.run { authError = error.localizedDescription; authBusy = false }
            }
        }
    }

    private func verifyCode() {
        authBusy = true; authError = ""
        let email = syncEmail, code = otpCode
        Task {
            do {
                try await sync.verifyOtp(email, code: code)
                await MainActor.run { authBusy = false; otpSent = false; otpCode = "" }
                await sync.syncNow()
            } catch {
                await MainActor.run { authError = error.localizedDescription; authBusy = false }
            }
        }
    }

    private func hotkeyRow(title: String, value: String, target: HotKeyManager.Target) -> some View {
        HStack {
            Text(title).frame(width: 120, alignment: .leading)
            Button(action: { startRecording(target) }) {
                Text(recording == target ? "키 조합을 누르세요…" : value)
                    .frame(minWidth: 150)
                    .foregroundColor(recording == target ? .secondary : .primary)
            }
            if recording == target {
                Button("취소") { recording = nil; HotKeyManager.shared.stopRecording() }
            }
        }
    }

    private func startRecording(_ target: HotKeyManager.Target) {
        guard recording == nil else { return }
        recording = target
        HotKeyManager.shared.startRecording(target) { disp in
            if target == .lookup { lookupHotkey = disp } else { hotkey = disp }
            recording = nil
        }
    }

    static func loginEnabled() -> Bool {
        if #available(macOS 13, *) { return SMAppService.mainApp.status == .enabled }
        return false
    }

    static func setLogin(_ on: Bool) {
        if #available(macOS 13, *) {
            do {
                if on { try SMAppService.mainApp.register() }
                else { try SMAppService.mainApp.unregister() }
            } catch {
                NSLog("VocaNote login item error: \(error.localizedDescription)")
            }
        }
    }
}
