import SwiftUI
import AppKit

/// AppKit 기반 검색 입력창.
/// SwiftUI `TextField` 가 NSPanel(nonactivating)+NSHostingView 호스팅 환경에서
/// 타이핑을 @Published 바인딩에 '매 키 입력마다' 반영하지 못하는 문제가 있어
/// (화면엔 글자가 보이지만 vm.query 는 안 바뀜 → 검색 결과가 stale),
/// NSTextField 의 controlTextDidChange 로 확실하게 vm.query 를 갱신한다.
struct VocaSearchField: NSViewRepresentable {
    @ObservedObject var vm: SearchViewModel

    func makeCoordinator() -> Coordinator { Coordinator(vm: vm) }

    func makeNSView(context: Context) -> NSTextField {
        let tf = NSTextField()
        tf.placeholderString = "영단어 · 약어 검색"
        tf.font = .systemFont(ofSize: 22)
        tf.isBordered = false
        tf.drawsBackground = false
        tf.focusRingType = .none
        tf.usesSingleLineMode = true
        tf.lineBreakMode = .byTruncatingTail
        tf.cell?.wraps = false
        tf.cell?.isScrollable = true
        tf.delegate = context.coordinator
        tf.stringValue = vm.query
        tf.setContentHuggingPriority(.defaultLow, for: .horizontal)
        tf.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        context.coordinator.field = tf
        // 벨트&멜빵: delegate 외에 알림도 직접 구독 (delegate 연결이 끊겨도 writeback 보장)
        context.coordinator.textObs = NotificationCenter.default.addObserver(
            forName: NSControl.textDidChangeNotification, object: tf, queue: .main
        ) { [weak coord = context.coordinator] _ in
            guard let coord = coord, let f = coord.field else { return }
            if coord.vm.query != f.stringValue { coord.vm.query = f.stringValue }
        }
        DispatchQueue.main.async { tf.window?.makeFirstResponder(tf) }
        return tf
    }

    func updateNSView(_ nsView: NSTextField, context: Context) {
        // 프로그램적으로 query 가 바뀐 경우(프리필/클리어/최근검색 클릭)만 필드에 반영.
        // 타이핑 중엔 controlTextDidChange 가 이미 둘을 같게 유지하므로 덮어쓰지 않음.
        if nsView.stringValue != vm.query {
            nsView.stringValue = vm.query
        }
    }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        let vm: SearchViewModel
        weak var field: NSTextField?
        private var focusObs: NSObjectProtocol?
        var textObs: NSObjectProtocol?

        init(vm: SearchViewModel) {
            self.vm = vm
            super.init()
            // 패널 열기/선택단어조회 시 포커스 + 리셋/프리필 (SwiftUI @FocusState 대체)
            focusObs = NotificationCenter.default.addObserver(
                forName: .vocaFocus, object: nil, queue: .main
            ) { [weak self] note in
                guard let self = self else { return }
                if let word = (note.object as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines), !word.isEmpty {
                    self.vm.query = word
                } else {
                    self.vm.reset()
                }
                if let field = self.field {
                    field.stringValue = self.vm.query
                    field.window?.makeFirstResponder(field)
                    let len = (field.stringValue as NSString).length
                    field.currentEditor()?.selectedRange = NSRange(location: len, length: 0)
                }
            }
        }

        deinit {
            if let o = focusObs { NotificationCenter.default.removeObserver(o) }
            if let o = textObs { NotificationCenter.default.removeObserver(o) }
        }

        // ★ 매 키 입력마다 vm.query 갱신 → Combine → search → results → 강제 재그리기
        func controlTextDidChange(_ obj: Notification) {
            guard let tf = obj.object as? NSTextField else { return }
            vm.query = tf.stringValue
        }
    }
}
