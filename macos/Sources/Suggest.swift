import Foundation

/// 라이브 사전 — Daum/Naver suggest를 URLSession으로 직접 호출.
/// (네이티브는 CORS가 없어 JSONP 불필요, 순수 JSON 파싱)
enum Suggest {
    private static let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"

    static func fetch(_ query: String, engine: SuggestEngine, completion: @escaping ([Suggestion]) -> Void) {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 1, let url = endpoint(q, engine) else { completion([]); return }
        var req = URLRequest(url: url)
        req.setValue(ua, forHTTPHeaderField: "User-Agent")
        req.timeoutInterval = 4
        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let data = data else { completion([]); return }
            let items = (engine == .daum) ? parseDaum(data) : parseNaver(data)
            completion(items)
        }.resume()
    }

    private static func endpoint(_ q: String, _ engine: SuggestEngine) -> URL? {
        switch engine {
        case .daum:
            var c = URLComponents(string: "https://suggest.dic.daum.net/language/v1/search.json")!
            c.queryItems = [.init(name: "cate", value: "eng"), .init(name: "q", value: q)]
            return c.url
        case .naver:
            var c = URLComponents(string: "https://ac-dict.naver.com/enko/ac")!
            c.queryItems = [
                .init(name: "q_enc", value: "utf-8"), .init(name: "st", value: "11001"),
                .init(name: "r_format", value: "json"), .init(name: "r_enc", value: "utf-8"),
                .init(name: "r_lt", value: "10001"), .init(name: "r_unicode", value: "0"),
                .init(name: "r_escape", value: "1"), .init(name: "q", value: q)
            ]
            return c.url
        }
    }

    // Daum: items.eng[].item = "code|word|뜻1, 뜻2..."
    private static func parseDaum(_ data: Data) -> [Suggestion] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = (root["items"] as? [String: Any])?["eng"] as? [[String: Any]] else { return [] }
        var out: [Suggestion] = []
        for it in items {
            guard let item = it["item"] as? String else { continue }
            let parts = item.components(separatedBy: "|")
            guard parts.count >= 2 else { continue }
            let term = parts[1].trimmingCharacters(in: .whitespaces)
            let meaning = parts.count >= 3
                ? parts[2...].joined(separator: "|").trimmingCharacters(in: .whitespaces) : nil
            if !term.isEmpty {
                out.append(Suggestion(term: term, meaningKo: meaning?.isEmpty == true ? nil : meaning, source: .daum))
            }
        }
        return out
    }

    // Naver: items[0] = [ [["word"],[""],["뜻"]], ... ]
    private static func parseNaver(_ data: Data) -> [Suggestion] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let groups = root["items"] as? [[Any]] else { return [] }
        var out: [Suggestion] = []
        for group in groups {
            for entryAny in group {
                guard let entry = entryAny as? [[Any]] else { continue }
                let term = (entry.first?.first as? String)?
                    .trimmingCharacters(in: .whitespaces) ?? ""
                var meaning: String? = nil
                if entry.count >= 3, let m = entry[2].first as? String {
                    let t = m.trimmingCharacters(in: .whitespaces)
                    meaning = t.isEmpty ? nil : t
                }
                if !term.isEmpty { out.append(Suggestion(term: term, meaningKo: meaning, source: .naver)) }
            }
        }
        return out
    }
}
