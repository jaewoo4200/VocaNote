import Foundation
import Combine

// 모든 변경은 메인스레드에서만 일어남(SwiftUI 바인딩 + DispatchQueue.main).
final class SearchViewModel: ObservableObject {
    // ⚠️ didSet으로 검색을 돌리지 말 것 — TextField 편집 중 @Published 재진입으로
    //    입력이 씹히는 버그가 생김. 검색 트리거는 아래 init()의 Combine 파이프라인이 담당.
    //    (뷰의 .onChange 는 NSHostingView+NSPanel 에서 body 재평가 누락으로 씹혀서 폐기함)
    @Published var query: String = ""
    @Published var results: [Suggestion] = []
    @Published var liveLoading = false
    @Published var engine: SuggestEngine = .daum
    @Published var selectedIndex = 0
    @Published var pinned = UserDefaults.standard.bool(forKey: "panel.pinned") {
        didSet { UserDefaults.standard.set(pinned, forKey: "panel.pinned") }
    }
    @Published var recents: [String] = RecentStore.shared.list()

    private var debounce: DispatchWorkItem?
    private var liveToken = 0
    private var cancellables = Set<AnyCancellable>()

    init() {
        // query 변경 → 검색. 뷰 .onChange 대신 모델 퍼블리셔를 직접 구독하므로
        // body 재평가/키윈도우 상태와 무관하게 '값이 바뀔 때마다' 확실히 발화한다.
        // .receive(on:.main) 로 다음 런루프로 넘겨 TextField 편집 중 재진입(입력 씹힘)을 차단.
        // Combine 단계에서 debounce 하지 않음 — 로컬 결과는 즉시 떠야 함(즉시성 유지).
        $query
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] q in self?.search(q) }
            .store(in: &cancellables)

        // 엔진(다음/네이버) 변경 → 현재 query 로 재검색. 초기값 발화는 dropFirst 로 무시.
        $engine
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.search(self.query)
            }
            .store(in: &cancellables)
    }

    func refreshRecents() { recents = RecentStore.shared.list() }

    func reset() {
        results = []
        liveLoading = false
        if !query.isEmpty { query = "" }
    }

    func moveSelection(_ delta: Int) {
        guard !results.isEmpty else { return }
        selectedIndex = max(0, min(results.count - 1, selectedIndex + delta))
    }

    func activateSelection() {
        guard results.indices.contains(selectedIndex) else { return }
        save(results[selectedIndex])
    }

    // init()의 $query Combine 파이프라인에서 호출 (didSet/뷰 .onChange 재진입 회피)
    func search(_ raw: String) {
        let q = raw.trimmingCharacters(in: .whitespaces)
        debounce?.cancel()
        selectedIndex = 0
        guard !q.isEmpty else { results = []; liveLoading = false; return }

        results = buildLocal(q)          // 로컬 결과 즉시
        liveLoading = true
        liveToken += 1
        let token = liveToken
        let eng = engine
        let work = DispatchWorkItem { [weak self] in
            Suggest.fetch(q, engine: eng) { live in
                DispatchQueue.main.async {
                    guard let self = self,
                          token == self.liveToken,
                          self.query.trimmingCharacters(in: .whitespaces) == q else { return }
                    self.results = self.merge(local: self.buildLocal(q), live: live)
                    self.liveLoading = false
                }
            }
        }
        debounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16, execute: work)
    }

    private func buildLocal(_ q: String) -> [Suggestion] {
        var out: [Suggestion] = []
        var seen = Set<String>()
        func add(_ s: Suggestion) {
            let n = s.normTerm
            guard !n.isEmpty, !seen.contains(n) else { return }
            seen.insert(n); out.append(s)
        }
        Wordbook.shared.query(q).forEach(add)
        AbbrevStore.shared.query(q).forEach(add)
        Wordlist.shared.query(q).forEach { add(Suggestion(term: $0, source: .dictionary)) }
        return out
    }

    // 순서: 내 단어장·약어/ktword(뜻 있음) → 라이브 사전 뜻 → 로컬 영단어
    private func merge(local: [Suggestion], live: [Suggestion]) -> [Suggestion] {
        var out: [Suggestion] = []
        var seen = Set<String>()
        func push(_ arr: [Suggestion]) {
            for s in arr {
                let n = s.normTerm
                guard !n.isEmpty, !seen.contains(n) else { continue }
                seen.insert(n); out.append(s)
            }
        }
        push(local.filter { $0.source == .wordbook || $0.source == .abbrev || $0.source == .ktword })
        push(live)
        push(local.filter { $0.source == .dictionary })
        return Array(out.prefix(12))
    }

    func save(_ s: Suggestion) {
        guard let meaning = s.meaningKo, !meaning.isEmpty else { return }
        Wordbook.shared.upsert(term: s.term, meaningKo: meaning)
        RecentStore.shared.push(s.term)
        refreshRecents()
        results = buildLocal(query.trimmingCharacters(in: .whitespaces))
    }
}
