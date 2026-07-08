import SwiftUI

// ============================================================================
// 내 단어장 브라우저 + 플래시카드 복습
// ============================================================================

final class WordbookWindow {
    static let shared = WordbookWindow()
    private var window: NSWindow?
    private var returnToPanel = false   // 검색 패널에서 열었을 때만 닫을 때 패널 복귀

    func show(returnToPanel: Bool = false) {
        self.returnToPanel = returnToPanel
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 560),
                             styleMask: [.titled, .closable, .resizable],
                             backing: .buffered, defer: false)
            w.title = "내 단어장"
            w.isReleasedWhenClosed = false
            w.center()
            w.contentView = NSHostingView(rootView: WordbookView())
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

struct WordbookView: View {
    @State private var entries: [WordEntry] = Wordbook.shared.activeEntries
    @State private var filter = ""
    @State private var reviewing = false
    @State private var showAdd = false
    @State private var newTerm = ""
    @State private var newMeaning = ""
    @State private var editLockTerm = false      // 수정 모드: 단어는 고정, 뜻만
    @FocusState private var addFocus: AddField?
    private enum AddField { case term, meaning }

    private var filtered: [WordEntry] {
        let q = filter.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return entries }
        return entries.filter { $0.termNorm.contains(q) || $0.meaningKo.lowercased().contains(q) }
    }

    var body: some View {
        Group {
            if reviewing {
                FlashcardView(cards: filtered.isEmpty ? entries : filtered) { reviewing = false }
            } else {
                browser
            }
        }
        .frame(minWidth: 480, minHeight: 460)
        .vocaSurfaceBackground()
        .onReceive(NotificationCenter.default.publisher(for: .vocaWordbookChanged)) { _ in
            entries = Wordbook.shared.activeEntries   // 동기화 후 자동 새로고침
        }
    }

    private var browser: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "character.book.closed.fill").foregroundColor(.vocaBrand)
                Text("내 단어장").font(.system(size: 18, weight: .bold)).tracking(-0.3)
                Spacer()
                Button { startAdd() } label: { Label("추가", systemImage: "plus") }
                Button { reviewing = true } label: {
                    Label("복습", systemImage: "rectangle.stack.fill")
                }
                .disabled(entries.isEmpty)
            }
            .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 10)

            statsBar

            if showAdd { addForm }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("단어장 안에서 찾기", text: $filter).textFieldStyle(.plain)
            }
            .padding(.horizontal, 18).padding(.bottom, 10)

            Divider()

            if entries.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray").font(.system(size: 34)).foregroundColor(.secondary)
                    Text("저장된 단어가 없어요").foregroundColor(.secondary)
                    Text("위 ‘추가’ 버튼 또는 검색 결과의 + 로 저장하세요").font(.caption).foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(filtered) { e in entryRow(e) }
                    }
                    .padding(8)
                }
            }
        }
    }

    // 통계 스트립: 전체 · 이번 주 · 오늘 (WordEntry 의 createdAt 만으로 계산)
    private var statsBar: some View {
        let now = Date()
        let weekAgo = now.addingTimeInterval(-7 * 24 * 3600)
        let dayStart = Calendar.current.startOfDay(for: now)
        let week = entries.filter { $0.createdAt >= weekAgo }.count
        let today = entries.filter { $0.createdAt >= dayStart }.count
        return HStack(spacing: 10) {
            stat("\(entries.count)", "전체 단어")
            stat("+\(week)", "이번 주")
            stat("+\(today)", "오늘")
        }
        .padding(.horizontal, 18).padding(.bottom, 12)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundColor(.vocaBrand)
            Text(label).font(.system(size: 10.5)).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.vocaBrand.opacity(0.07)))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.vocaBrand.opacity(0.12)))
    }

    // 직접 단어+뜻 추가 / 기존 뜻 수정 폼
    private var addForm: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                TextField("단어 (예: resilience)", text: $newTerm)
                    .textFieldStyle(.roundedBorder)
                    .focused($addFocus, equals: .term)
                    .disabled(editLockTerm)
                    .frame(maxWidth: 180)
                TextField("뜻 (예: 회복력, 탄성)", text: $newMeaning)
                    .textFieldStyle(.roundedBorder)
                    .focused($addFocus, equals: .meaning)
                    .onSubmit(saveEntry)
            }
            HStack {
                if editLockTerm {
                    Text("‘\(newTerm)’ 뜻 수정").font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                Button("취소") { cancelAdd() }
                Button(editLockTerm ? "저장" : "추가") { saveEntry() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(newTerm.trimmingCharacters(in: .whitespaces).isEmpty
                              || newMeaning.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(Color.vocaBrand.opacity(0.06))
    }

    private func startAdd() {
        newTerm = ""; newMeaning = ""; editLockTerm = false; showAdd = true
        DispatchQueue.main.async { addFocus = .term }
    }
    private func startEdit(_ e: WordEntry) {
        newTerm = e.term; newMeaning = e.meaningKo; editLockTerm = true; showAdd = true
        DispatchQueue.main.async { addFocus = .meaning }
    }
    private func cancelAdd() {
        showAdd = false; newTerm = ""; newMeaning = ""; editLockTerm = false
    }
    private func saveEntry() {
        let t = newTerm.trimmingCharacters(in: .whitespaces)
        let m = newMeaning.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, !m.isEmpty else { return }
        Wordbook.shared.upsert(term: t, meaningKo: m)   // 신규 추가/기존 수정 + 자동 동기화
        entries = Wordbook.shared.activeEntries
        cancelAdd()
    }

    private func entryRow(_ e: WordEntry) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(e.term).font(.system(size: 15, weight: .semibold))
                Text(e.meaningKo).font(.system(size: 13)).foregroundColor(.secondary)
            }
            Spacer(minLength: 8)
            Button { Speaker.shared.speak(e.term) } label: {
                Image(systemName: "speaker.wave.2.fill").font(.system(size: 13)).foregroundColor(.secondary)
            }.buttonStyle(HoverIconStyle()).help("발음")
            Button { startEdit(e) } label: {
                Image(systemName: "square.and.pencil").font(.system(size: 13)).foregroundColor(.secondary)
            }.buttonStyle(HoverIconStyle()).help("뜻 수정")
            Button {
                Wordbook.shared.remove(termNorm: e.termNorm)
                entries = Wordbook.shared.activeEntries
            } label: {
                Image(systemName: "trash").font(.system(size: 13)).foregroundColor(.red.opacity(0.8))
            }.buttonStyle(HoverIconStyle()).help("삭제")
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.03)))
    }
}

// MARK: 플래시카드

struct FlashcardView: View {
    let cards: [WordEntry]
    let onClose: () -> Void

    @State private var order: [Int] = []
    @State private var pos = 0
    @State private var revealed = false
    @State private var known = Set<Int>()

    private var current: WordEntry? {
        guard order.indices.contains(pos), cards.indices.contains(order[pos]) else { return nil }
        return cards[order[pos]]
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { onClose() } label: { Label("목록", systemImage: "chevron.left") }
                    .buttonStyle(HoverIconStyle()).foregroundColor(.vocaBrand)
                Spacer()
                Text(order.isEmpty ? "" : "\(pos + 1) / \(order.count)")
                    .font(.system(size: 12, weight: .medium, design: .rounded)).foregroundColor(.secondary)
                Spacer()
                Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { shuffle() } } label: {
                    Image(systemName: "shuffle")
                }.buttonStyle(HoverIconStyle()).help("섞기")
            }
            .padding(.horizontal, 18).padding(.vertical, 12)

            // 진행 바 — 카드 넘길 때마다 스프링으로 채워짐
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.vocaBrand.opacity(0.12))
                    Capsule().fill(Color.vocaBrand)
                        .frame(width: order.isEmpty ? 0 : g.size.width * CGFloat(min(pos, order.count)) / CGFloat(order.count))
                        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: pos)
                }
            }
            .frame(height: 4)
            .padding(.horizontal, 18).padding(.bottom, 10)
            Divider()

            if let e = current {
                VStack(spacing: 18) {
                    Spacer()
                    // 카드 서피스
                    VStack(spacing: 16) {
                        HStack(spacing: 10) {
                            Text(e.term).font(.system(size: 34, weight: .bold)).tracking(-0.4)
                            Button { Speaker.shared.speak(e.term) } label: {
                                Image(systemName: "speaker.wave.2.fill").font(.system(size: 18))
                                    .foregroundColor(.secondary)
                            }.buttonStyle(HoverIconStyle())
                        }
                        ZStack {
                            if revealed {
                                Text(e.meaningKo).font(.system(size: 18, weight: .medium)).foregroundColor(.vocaBrand)
                                    .multilineTextAlignment(.center).padding(.horizontal, 24)
                                    .transition(.asymmetric(
                                        insertion: .opacity.combined(with: .offset(y: 6)).combined(with: .scale(scale: 0.97)),
                                        removal: .opacity))
                            } else {
                                Button {
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { revealed = true }
                                } label: {
                                    HStack(spacing: 6) {
                                        Text("뜻 보기").font(.system(size: 14, weight: .medium))
                                        KeyCap(text: "space")
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 8)
                                    .background(Color.vocaBrand.opacity(0.12))
                                    .foregroundColor(.vocaBrand).clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                                .keyboardShortcut(.space, modifiers: [])
                            }
                        }
                        .frame(minHeight: 56)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 36).padding(.horizontal, 24)
                    .background(
                        RoundedRectangle(cornerRadius: VocaTheme.rLg)
                            .fill(VocaTheme.surface.opacity(0.6))
                            .shadow(color: .black.opacity(0.07), radius: 14, y: 5)
                    )
                    .overlay(RoundedRectangle(cornerRadius: VocaTheme.rLg).strokeBorder(VocaTheme.border))
                    .padding(.horizontal, 24)
                    .id(pos)   // 카드 전환 시 뷰 교체 → 트랜지션
                    .transition(.asymmetric(insertion: .offset(x: 26).combined(with: .opacity),
                                            removal: .offset(x: -26).combined(with: .opacity)))
                    Spacer()
                    HStack(spacing: 12) {
                        Button { advance(gotIt: false) } label: {
                            HStack(spacing: 6) { Text("다시 볼래요"); KeyCap(text: "1") }.frame(maxWidth: .infinity)
                        }
                        .keyboardShortcut("1", modifiers: [])
                        Button { advance(gotIt: true) } label: {
                            HStack(spacing: 6) { Text("알아요"); KeyCap(text: "2") }.frame(maxWidth: .infinity)
                        }
                        .tint(.vocaBrand)
                        .keyboardShortcut("2", modifiers: [])
                    }
                    .controlSize(.large)
                    .padding(.horizontal, 24).padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .animation(.spring(response: 0.3, dampingFraction: 0.85), value: pos)
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 40)).foregroundColor(.vocaBrand)
                    Text("복습 완료!").font(.system(size: 18, weight: .bold))
                    Text("\(known.count) / \(cards.count) 개를 안다고 표시했어요")
                        .font(.system(size: 13)).foregroundColor(.secondary)
                    Button("다시 복습") { shuffle() }.padding(.top, 6)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onAppear { if order.isEmpty { shuffle() } }
    }

    private func shuffle() {
        order = Array(cards.indices).shuffled()
        pos = 0; revealed = false; known = []
    }

    private func advance(gotIt: Bool) {
        if gotIt, order.indices.contains(pos) { known.insert(order[pos]) }
        withAnimation { revealed = false; pos += 1 }
    }
}
