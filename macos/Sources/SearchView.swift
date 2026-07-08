import SwiftUI

extension Notification.Name { static let vocaFocus = Notification.Name("VocaFocus") }

extension Color {
    static var vocaBrand: Color { VocaTheme.brand }   // 웹과 동일, 라이트/다크 자동 대응
    static func source(_ s: SuggestSource) -> Color {
        switch s {
        case .wordbook: return .vocaBrand
        case .daum:     return Color(red: 0.20, green: 0.48, blue: 0.95)
        case .naver:    return Color(red: 0.13, green: 0.65, blue: 0.35)
        case .ktword:   return Color(red: 0.55, green: 0.40, blue: 0.85)
        case .abbrev, .dictionary: return .secondary
        }
    }
    static func sourceLabel(_ s: SuggestSource) -> String {
        switch s {
        case .wordbook: return "단어장"
        case .daum: return "다음"
        case .naver: return "네이버"
        case .ktword: return "ktword"
        case .abbrev: return "약어"
        case .dictionary: return "사전"
        }
    }
}

struct KeyCap: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .padding(.horizontal, 5).padding(.vertical, 1)
            .background(Color.primary.opacity(0.08))
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.primary.opacity(0.09)))
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

/// 아이콘 버튼 공용 스타일 — 호버 배경 + 누름 스케일 (웹 .icon-btn 과 동일한 감각)
struct HoverIconStyle: ButtonStyle {
    @State private var hovering = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(4)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(hovering ? Color.primary.opacity(0.08) : Color.clear)
            )
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: 0.12), value: hovering)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
            .onHover { hovering = $0 }
            .contentShape(Rectangle())
    }
}

struct SearchView: View {
    @ObservedObject var vm: SearchViewModel
    @State private var showTutorial = !UserDefaults.standard.bool(forKey: "voca.tutorial.seen.v1")

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                header
                searchBar
                Divider().overlay(VocaTheme.border)
                results
                Divider().overlay(VocaTheme.border)
                footer
            }
            if showTutorial {
                TutorialOverlay(onClose: dismissTutorial)
                    .transition(.opacity)
            }
            // 저장 토스트 — 하단에서 스프링 등장
            if let saved = vm.justSavedTerm {
                VStack {
                    Spacer()
                    HStack(spacing: 7) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(.white)
                        Text("'\(saved)' 단어장에 저장됨")
                            .font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Capsule().fill(Color.vocaBrand).shadow(color: .black.opacity(0.25), radius: 10, y: 4))
                    .padding(.bottom, 44)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .allowsHitTesting(false)
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.8), value: vm.justSavedTerm)
        .frame(minWidth: 560, minHeight: 380)
        .vocaSurfaceBackground()
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(VocaTheme.border, lineWidth: 1))
        // 검색 트리거는 SearchViewModel.init()의 $query/$engine Combine 구독이 담당.
        // 입력창은 AppKit VocaSearchField(NSTextField)로 교체 — SwiftUI TextField 가
        // 이 패널 호스팅 환경에서 타이핑을 바인딩에 반영 못 하던(결과 stale) 버그 수정.
        // 포커스/리셋/프리필은 VocaSearchField 의 Coordinator 가 .vocaFocus 로 처리.
        .onReceive(NotificationCenter.default.publisher(for: .vocaShowTutorial)) { _ in
            withAnimation { showTutorial = true }
        }
    }

    private func dismissTutorial() {
        UserDefaults.standard.set(true, forKey: "voca.tutorial.seen.v1")
        withAnimation { showTutorial = false }
    }

    // 상단 바: 워드마크 + 단어장/설정/도움말 바로가기 (메뉴바 없이 이동)
    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "character.book.closed.fill")
                .foregroundColor(.vocaBrand).font(.system(size: 12))
            Text("VocaNote").font(.system(size: 12.5, weight: .semibold)).foregroundColor(VocaTheme.text)
            Spacer()
            navIcon("books.vertical.fill", "단어장 (⌘L)") { WordbookWindow.shared.show(returnToPanel: true) }
            navIcon("gearshape.fill", "설정 (⌘,)") { SettingsWindow.shared.show(returnToPanel: true) }
            navIcon("questionmark.circle", "사용법") { withAnimation { showTutorial = true } }
        }
        .padding(.horizontal, 15).padding(.top, 11).padding(.bottom, 1)
    }

    private func navIcon(_ icon: String, _ help: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 12.5)).foregroundColor(VocaTheme.textMuted)
        }
        .buttonStyle(HoverIconStyle()).help(help)
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary).font(.system(size: 18))
            VocaSearchField(vm: vm)
                .frame(height: 30)
            if vm.liveLoading {
                ProgressView().controlSize(.small)
            }
            if !vm.query.isEmpty {
                Button { vm.query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                }.buttonStyle(.plain)
            }
            Picker("", selection: $vm.engine) {
                Text("다음").tag(SuggestEngine.daum)
                Text("네이버").tag(SuggestEngine.naver)
            }
            .pickerStyle(.segmented)
            .frame(width: 128)
            .labelsHidden()
            Button { vm.pinned.toggle() } label: {
                Image(systemName: vm.pinned ? "pin.fill" : "pin")
                    .foregroundColor(vm.pinned ? .vocaBrand : .secondary)
                    .font(.system(size: 15))
            }
            .buttonStyle(.plain)
            .help(vm.pinned ? "고정 해제 (바깥 클릭 시 닫힘)" : "창 고정 (바깥 클릭해도 유지)")
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    private var results: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(vm.results.enumerated()), id: \.element.id) { idx, s in
                        row(s, selected: idx == vm.selectedIndex)
                            .id(idx)
                            .onTapGesture { vm.selectedIndex = idx }
                            .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 3)),
                                                    removal: .opacity))
                    }
                    if vm.results.isEmpty && !vm.query.isEmpty {
                        Text(vm.liveLoading ? "검색 중…" : "일치하는 결과가 없어요")
                            .foregroundColor(.secondary).padding()
                    } else if vm.query.isEmpty {
                        emptyState
                    }
                }
                .padding(6)
                // 라이브 뜻이 병합될 때 행이 순간이동하지 않고 부드럽게 정착
                .animation(.easeOut(duration: 0.15), value: vm.results.map(\.id))
            }
            // anchor:nil → 최소 스크롤: 하이라이트가 화면 안에 있으면 스크롤하지 않고,
            // 선택이 뷰포트 밖으로 나갈 때만 딱 보일 만큼만 스크롤 (한 줄씩 이동 느낌)
            .onChange(of: vm.selectedIndex) { _, new in
                guard new > 0 else { return }  // 타이핑 시 0 리셋으로 스크롤/포커스 방해 방지
                withAnimation(.easeOut(duration: 0.12)) { proxy.scrollTo(new) }
            }
        }
    }

    private func row(_ s: Suggestion, selected: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    termText(s.term)
                    if let full = s.full {
                        Text("· \(full)").fontWeight(.regular).foregroundColor(.secondary)
                    }
                    chip(s.source)
                    if let url = s.sourceURL, let link = URL(string: url) {
                        Link("원문 ↗", destination: link).font(.system(size: 11))
                    }
                }
                if let m = s.meaningKo, !m.isEmpty {
                    Text(m).foregroundColor(.secondary).font(.system(size: 13))
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 6) {
                if isEnglish(s.term) {
                    Button { Speaker.shared.speak(s.term) } label: {
                        Image(systemName: "speaker.wave.2.fill").font(.system(size: 13))
                            .foregroundColor(.secondary)
                    }.buttonStyle(HoverIconStyle()).help("발음 듣기")
                }
                Button { copyRow(s) } label: {
                    Image(systemName: "doc.on.doc").font(.system(size: 13))
                        .foregroundColor(.secondary)
                }.buttonStyle(HoverIconStyle()).help("복사")
                if s.source == .wordbook || vm.justSavedTerm == s.term {
                    // 방금 저장됨 → 체크로 모프 (스프링 팝)
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 17))
                        .foregroundColor(.vocaBrand)
                        .scaleEffect(vm.justSavedTerm == s.term ? 1.15 : 1)
                        .animation(.spring(response: 0.25, dampingFraction: 0.55), value: vm.justSavedTerm)
                        .padding(4)
                } else if let m = s.meaningKo, !m.isEmpty {
                    Button { vm.save(s) } label: {
                        Image(systemName: "plus.circle.fill").font(.system(size: 17))
                            .foregroundColor(.vocaBrand)
                    }.buttonStyle(HoverIconStyle()).help("단어장에 저장 (↵)")
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(
            // 선택 행: 채움 + 왼쪽 브랜드 액센트 바 (ultraThinMaterial 위에서도 또렷하게)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(selected ? Color.vocaBrand.opacity(0.13) : Color.clear)
                if selected {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.vocaBrand)
                        .frame(width: 3)
                        .padding(.vertical, 5)
                }
            }
        )
    }

    // 검색어와 일치하는 프리픽스를 브랜드색으로 강조
    private func termText(_ term: String) -> Text {
        let q = vm.query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty, q.count <= term.count, term.lowercased().hasPrefix(q) else {
            var a = AttributedString(term); a.font = .body.weight(.semibold)
            return Text(a)
        }
        var head = AttributedString(String(term.prefix(q.count)))
        head.font = .body.bold(); head.foregroundColor = .vocaBrand
        var tail = AttributedString(String(term.dropFirst(q.count)))
        tail.font = .body.weight(.semibold)
        head.append(tail)
        return Text(head)
    }

    private func isEnglish(_ term: String) -> Bool {
        term.range(of: "^[A-Za-z][A-Za-z '\\-]*$", options: .regularExpression) != nil
    }

    private func copyRow(_ s: Suggestion) {
        let text = (s.meaningKo?.isEmpty == false) ? "\(s.term) — \(s.meaningKo!)" : s.term
        // 감시자가 우리 복사에 반응(자기 조회)하지 않게 내부 쓰기로 감싼다
        ClipboardWatcher.shared.performInternalWrite {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
        }
    }

    // 빈 상태: 최근 검색 or 안내
    private var emptyState: some View {
        Group {
            if vm.recents.isEmpty {
                Text("단어나 약어를 입력하세요")
                    .foregroundColor(.secondary).font(.system(size: 13)).padding()
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("최근 검색").font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.secondary)
                        Spacer()
                        Button("지우기") { RecentStore.shared.clear(); vm.refreshRecents() }
                            .buttonStyle(.plain).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12).padding(.top, 6)
                    ForEach(vm.recents, id: \.self) { term in
                        HStack(spacing: 8) {
                            Image(systemName: "clock.arrow.circlepath")
                                .foregroundColor(.secondary).font(.system(size: 12))
                            Text(term).font(.system(size: 14))
                            Spacer()
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .contentShape(Rectangle())
                        .onTapGesture { vm.query = term }
                    }
                }
            }
        }
    }

    private func chip(_ src: SuggestSource) -> some View {
        Text(Color.sourceLabel(src))
            .font(.system(size: 10, weight: .medium))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(Color.source(src).opacity(0.16))
            .foregroundColor(Color.source(src))
            .clipShape(Capsule())
    }

    private var footer: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) { KeyCap(text: "↑"); KeyCap(text: "↓"); Text("이동") }
            HStack(spacing: 4) { KeyCap(text: "↵"); Text("저장") }
            HStack(spacing: 4) { KeyCap(text: "esc"); Text("닫기") }
            Spacer()
            if !vm.results.isEmpty { Text("\(vm.results.count)개") }
        }
        .font(.system(size: 11))
        .foregroundColor(.secondary)
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}
