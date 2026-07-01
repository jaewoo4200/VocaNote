import SwiftUI

// ============================================================================
// 내 단어장 브라우저 + 플래시카드 복습
// ============================================================================

final class WordbookWindow {
    static let shared = WordbookWindow()
    private var window: NSWindow?

    func show() {
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 560),
                             styleMask: [.titled, .closable, .resizable],
                             backing: .buffered, defer: false)
            w.title = "내 단어장"
            w.isReleasedWhenClosed = false
            w.center()
            w.contentView = NSHostingView(rootView: WordbookView())
            NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: w, queue: .main) { _ in
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
        .background(.ultraThinMaterial)
        .onReceive(NotificationCenter.default.publisher(for: .vocaWordbookChanged)) { _ in
            entries = Wordbook.shared.activeEntries   // 동기화 후 자동 새로고침
        }
    }

    private var browser: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "character.book.closed.fill").foregroundColor(.vocaBrand)
                Text("내 단어장").font(.system(size: 18, weight: .bold))
                Text("\(entries.count)")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Color.vocaBrand.opacity(0.14))
                    .foregroundColor(.vocaBrand).clipShape(Capsule())
                Spacer()
                Button {
                    reviewing = true
                } label: {
                    Label("복습 시작", systemImage: "rectangle.stack.fill")
                }
                .disabled(entries.isEmpty)
            }
            .padding(.horizontal, 18).padding(.vertical, 14)

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
                    Text("검색 결과에서 + 를 눌러 저장하세요").font(.caption).foregroundColor(.secondary)
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

    private func entryRow(_ e: WordEntry) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(e.term).font(.system(size: 15, weight: .semibold))
                Text(e.meaningKo).font(.system(size: 13)).foregroundColor(.secondary)
            }
            Spacer(minLength: 8)
            Button { Speaker.shared.speak(e.term) } label: {
                Image(systemName: "speaker.wave.2.fill").font(.system(size: 13)).foregroundColor(.secondary)
            }.buttonStyle(.plain).help("발음")
            Button {
                Wordbook.shared.remove(termNorm: e.termNorm)
                entries = Wordbook.shared.activeEntries
            } label: {
                Image(systemName: "trash").font(.system(size: 13)).foregroundColor(.red.opacity(0.8))
            }.buttonStyle(.plain).help("삭제")
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
                    .buttonStyle(.plain).foregroundColor(.vocaBrand)
                Spacer()
                Text(order.isEmpty ? "" : "\(pos + 1) / \(order.count)")
                    .font(.system(size: 12)).foregroundColor(.secondary)
                Spacer()
                Button { shuffle() } label: { Image(systemName: "shuffle") }.buttonStyle(.plain)
            }
            .padding(.horizontal, 18).padding(.vertical, 14)
            Divider()

            if let e = current {
                VStack(spacing: 18) {
                    Spacer()
                    HStack(spacing: 10) {
                        Text(e.term).font(.system(size: 34, weight: .bold))
                        Button { Speaker.shared.speak(e.term) } label: {
                            Image(systemName: "speaker.wave.2.fill").font(.system(size: 18))
                                .foregroundColor(.secondary)
                        }.buttonStyle(.plain)
                    }
                    if revealed {
                        Text(e.meaningKo).font(.system(size: 18)).foregroundColor(.vocaBrand)
                            .multilineTextAlignment(.center).padding(.horizontal, 24)
                    } else {
                        Button { withAnimation { revealed = true } } label: {
                            Text("뜻 보기").font(.system(size: 14, weight: .medium))
                                .padding(.horizontal, 18).padding(.vertical, 8)
                                .background(Color.vocaBrand.opacity(0.12))
                                .foregroundColor(.vocaBrand).clipShape(Capsule())
                        }.buttonStyle(.plain)
                    }
                    Spacer()
                    HStack(spacing: 12) {
                        Button { advance(gotIt: false) } label: {
                            Text("다시 볼래요").frame(maxWidth: .infinity)
                        }
                        Button { advance(gotIt: true) } label: {
                            Text("알아요").frame(maxWidth: .infinity)
                        }.tint(.vocaBrand)
                    }
                    .controlSize(.large)
                    .padding(.horizontal, 24).padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
