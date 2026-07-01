import Foundation

private struct RawAbbrev: Decodable {
    let abbr: String
    let full: String?
    let ko: String
    let domains: [String]?
    let url: String?
}

/// 번들된 약어/용어집(abbreviations.json + ktword.json) 검색.
final class AbbrevStore {
    static let shared = AbbrevStore()
    private var seeds: [RawAbbrev] = []
    private(set) var ready = false

    func load() {
        for name in ["abbreviations", "ktword"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
                  let data = try? Data(contentsOf: url),
                  let rows = try? JSONDecoder().decode([RawAbbrev].self, from: data) else { continue }
            seeds.append(contentsOf: rows)
        }
        ready = true
    }

    /// 약어 프리픽스 / 원형 프리픽스 / 한글뜻 부분일치로 매칭.
    func query(_ q: String, limit: Int = 6) -> [Suggestion] {
        let n = normalize(q)
        guard n.count >= 1 else { return [] }
        var scored: [(Int, RawAbbrev)] = []
        for s in seeds {
            let abbr = normalize(s.abbr)
            let full = normalize(s.full ?? "")
            var score = 0
            if abbr == n { score += 120 }
            else if abbr.hasPrefix(n) { score += 90 }
            else if abbr.contains(n) { score += 55 }
            if full.hasPrefix(n) { score += 60 }
            else if full.contains(n) { score += 35 }
            if normalize(s.ko).contains(n) { score += 25 }
            if score > 0 { scored.append((score, s)) }
        }
        scored.sort { $0.0 > $1.0 }
        return scored.prefix(limit).map { _, s in
            let isKtword = (s.url != nil)
            let full = (s.full != nil && s.full != s.abbr) ? s.full : nil
            return Suggestion(term: s.abbr,
                              meaningKo: s.ko,
                              full: full,
                              source: isKtword ? .ktword : .abbrev,
                              sourceURL: s.url)
        }
    }
}
