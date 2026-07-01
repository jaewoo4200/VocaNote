import Cocoa
import SwiftUI
import Carbon.HIToolbox
import Combine

// ============================================================================
// VocaNote — from-scratch 네이티브 macOS 검색 오버레이 (SwiftUI + 네이티브 사전)
//   • ⌥Space 로 어디서나 뜨는 검색 패널 (Spotlight 스타일)
//   • 로컬 즉시 자동완성 + Daum/Naver 라이브 사전 뜻(URLSession, JSONP 불필요)
//   • 내 단어장 로컬 저장 / 메뉴바 전용(Dock 없음)
// ============================================================================

let kPanelWidth: CGFloat = 620
let kPanelHeight: CGFloat = 460

final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var statusItem: NSStatusItem!
    var panel: OverlayPanel!
    let viewModel = SearchViewModel()
    var cancellables = Set<AnyCancellable>()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        // 데이터 로드 (번들 사전/약어/ktword + 내 단어장)
        Wordlist.shared.load()
        AbbrevStore.shared.load()
        Wordbook.shared.load()

        setupMainMenu()      // Cmd+A/C/V/X 등 편집 단축키 활성화
        setupStatusItem()
        setupPanel()
        setupKeyMonitor()

        // 전역 단축키 (변경 가능): 패널 토글 + 선택 단어 조회
        HotKeyManager.shared.onTrigger = { [weak self] in self?.togglePanel() }
        HotKeyManager.shared.onLookup = { [weak self] in self?.lookupSelection() }
        HotKeyManager.shared.installHandler()
        HotKeyManager.shared.register()

        // 클립보드 감시(옵션): 복사한 단어 자동 조회
        ClipboardWatcher.shared.onWord = { [weak self] word in self?.present(word: word) }
        ClipboardWatcher.shared.startIfEnabled()

        // ★ 핵심 수정: 떠 있는 nonactivating 패널(accessory 앱)이 occlusionState 에서
        //   .visible 로 안 잡혀 macOS 가 이 창의 화면 갱신(commit)을 멈추는 경우가 있음.
        //   → SwiftUI body 는 재평가되는데 화면엔 안 그려짐(결과 리스트 stale).
        //   모델이 바뀔 때마다 호스팅뷰를 강제로 즉시 재그려 이 일시정지를 우회한다.
        viewModel.objectWillChange
            .receive(on: DispatchQueue.main)   // 변경 적용 후 다음 런루프에 그린다
            .sink { [weak self] in
                guard let self = self, self.panel.isVisible else { return }
                self.panel.contentView?.display()
            }
            .store(in: &cancellables)

        // 설정의 "사용법 다시 보기" → 패널 열기 (SearchView 가 튜토리얼 표시)
        NotificationCenter.default.addObserver(forName: .vocaShowTutorial, object: nil, queue: .main) { [weak self] _ in
            self?.showPanel()
        }
        // 설정/단어장 창을 닫으면 메인 검색 패널로 복귀
        NotificationCenter.default.addObserver(forName: .vocaReturnToPanel, object: nil, queue: .main) { [weak self] _ in
            self?.showPanel()
        }

        showPanel()

        // 로그인 되어 있으면 시작 시 1회 동기화 (안 되어 있으면 no-op)
        Task { await SyncManager.shared.syncNow() }
    }

    // 편집 단축키(전체선택/복사/붙여넣기 등)는 mainMenu가 있어야 텍스트필드로 라우팅됨
    func setupMainMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "내 단어장", action: #selector(openWordbook), keyEquivalent: "l")
        appMenu.addItem(withTitle: "설정…", action: #selector(openSettings), keyEquivalent: ",")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "VocaNote 종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "편집")
        editMenu.addItem(withTitle: "실행 취소", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "다시 실행", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "잘라내기", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "복사", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "붙여넣기", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "전체 선택", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }

    @objc func openSettings() { SettingsWindow.shared.show() }
    @objc func openWordbook() { WordbookWindow.shared.show() }

    // 선택 단어 조회 단축키 → 다른 앱의 선택 텍스트를 가져와 패널에 프리필
    @objc func lookupSelection() {
        if !SelectionLookup.isTrusted { SelectionLookup.requestPermissionPrompt() }
        SelectionLookup.grab { [weak self] word in self?.present(word: word) }
    }

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            if let img = NSImage(systemSymbolName: "character.book.closed.fill", accessibilityDescription: "VocaNote") {
                img.isTemplate = true
                button.image = img
            } else {
                button.title = "V"
            }
            button.toolTip = "VocaNote (\(HotKeyManager.shared.display))"
        }
        let menu = NSMenu()
        menu.addItem(withTitle: "검색 열기  (\(HotKeyManager.shared.display))", action: #selector(showPanel), keyEquivalent: "")
        menu.addItem(withTitle: "선택 단어 조회  (\(HotKeyManager.shared.lookupDisplay))", action: #selector(lookupSelection), keyEquivalent: "")
        menu.addItem(withTitle: "내 단어장", action: #selector(openWordbook), keyEquivalent: "")
        menu.addItem(withTitle: "설정…", action: #selector(openSettings), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "종료", action: #selector(quit), keyEquivalent: "")
        statusItem.menu = menu
    }

    func setupPanel() {
        let rect = NSRect(x: 0, y: 0, width: kPanelWidth, height: kPanelHeight)
        panel = OverlayPanel(
            contentRect: rect,
            styleMask: [.titled, .closable, .fullSizeContentView, .nonactivatingPanel, .resizable],
            backing: .buffered,
            defer: false
        )
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isOpaque = false                 // 라운드 카드가 보이도록 투명 배경
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        // 트래픽 라이트 숨김 (Spotlight 룩)
        [.closeButton, .miniaturizeButton, .zoomButton].forEach {
            panel.standardWindowButton($0)?.isHidden = true
        }

        // ⚠️ 반드시 NSHostingController 로 호스팅할 것.
        //    bare NSHostingView 를 panel.contentView 로 꽂으면 SwiftUI 업데이트 루프가
        //    제대로 안 돌아 @Published 가 바뀌어도 뷰가 다시 안 그려짐(=결과 리스트 stale).
        //    NSHostingController 는 SwiftUI 라이프사이클/업데이트를 정상 구동한다.
        let hosting = NSHostingController(rootView: SearchView(vm: viewModel))
        panel.contentViewController = hosting
        panel.setContentSize(NSSize(width: kPanelWidth, height: kPanelHeight))
    }

    @objc func showPanel() { present(word: nil) }

    // word != nil 이면 그 단어로 프리필해서 조회, nil 이면 초기화 후 열기
    func present(word: String?) {
        viewModel.refreshRecents()
        centerPanel()
        panel.makeKeyAndOrderFront(nil)
        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
        NotificationCenter.default.post(name: .vocaFocus, object: word)
        SyncManager.shared.syncIfStale()   // 열 때 다른 기기 변경사항 받아오기(스로틀)
    }

    func togglePanel() {
        if panel.isVisible { panel.orderOut(nil) } else { showPanel() }
    }

    // 키보드 내비게이션: ↑↓ 선택, ↵ 저장, esc 닫기 (타이핑은 그대로 통과)
    func setupKeyMonitor() {
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, self.panel.isKeyWindow else { return event }
            switch event.keyCode {
            case 125: self.viewModel.moveSelection(1); return nil     // ↓
            case 126: self.viewModel.moveSelection(-1); return nil    // ↑
            case 36, 76: self.viewModel.activateSelection(); return nil  // ↵
            case 53: self.panel.orderOut(nil); return nil            // esc
            default: return event
            }
        }
    }

    @objc func quit() { NSApp.terminate(nil) }

    func centerPanel() {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return }
        var frame = panel.frame
        frame.origin.x = visible.midX - frame.width / 2
        frame.origin.y = visible.midY - frame.height / 2 + visible.height * 0.10
        panel.setFrame(frame, display: true)
    }

    // 바깥 클릭 시 숨김 (Spotlight 스타일) — 단, 고정(pin) 상태면 유지
    func windowDidResignKey(_ notification: Notification) {
        if !viewModel.pinned { panel.orderOut(nil) }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
