import Foundation

/// 번들된 빈도순 영단어 리스트(wordlist.txt)를 인메모리 프리픽스 인덱스로.
final class Wordlist {
    static let shared = Wordlist()

    private var oneChar: [Character: [String]] = [:]
    private var twoChar: [String: [String]] = [:]
    private(set) var ready = false

    func load() {
        guard let url = Bundle.main.url(forResource: "wordlist", withExtension: "txt"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        for raw in text.split(separator: "\n") {
            let w = raw.trimmingCharacters(in: .whitespaces).lowercased()
            guard let first = w.first else { continue }
            oneChar[first, default: []].append(w)
            if w.count >= 2 {
                twoChar[String(w.prefix(2)), default: []].append(w)
            }
        }
        ready = true
    }

    /// prefix로 시작하는 단어를 빈도순으로 최대 limit개.
    func query(_ prefix: String, limit: Int = 8) -> [String] {
        let p = prefix.trimmingCharacters(in: .whitespaces).lowercased()
        guard !p.isEmpty else { return [] }
        let bucket: [String]? = (p.count == 1) ? oneChar[p.first!] : twoChar[String(p.prefix(2))]
        guard let b = bucket else { return [] }
        var out: [String] = []
        for w in b where w.hasPrefix(p) {
            out.append(w)
            if out.count >= limit { break }
        }
        return out
    }
}
