import Foundation

enum SuggestSource: String {
    case wordbook, abbrev, ktword, daum, naver, dictionary
}

/// 검색 결과 한 줄.
struct Suggestion: Identifiable {
    let id = UUID()
    let term: String
    var meaningKo: String?
    var full: String?          // 약어 원형 등
    var source: SuggestSource
    var sourceURL: String?     // ktword 원문 링크 등

    var normTerm: String { term.lowercased().trimmingCharacters(in: .whitespaces) }
}

enum SuggestEngine: String, CaseIterable {
    case daum, naver
    var label: String { self == .daum ? "다음" : "네이버" }
}

func normalize(_ s: String) -> String {
    s.precomposedStringWithCanonicalMapping
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
}
