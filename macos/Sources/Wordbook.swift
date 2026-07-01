import Foundation

extension Notification.Name { static let vocaWordbookChanged = Notification.Name("VocaWordbookChanged") }

struct WordEntry: Codable, Identifiable {
    var id: String { termNorm }
    var term: String
    var termNorm: String
    var meaningKo: String
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date? = nil          // 소프트 삭제(동기화용 tombstone)
}

/// 내 단어장 — Application Support/VocaNote/wordbook.json 에 저장.
/// 삭제는 tombstone(soft delete)로 남겨 웹/폰과 동기화 시 삭제가 전파되게 함.
final class Wordbook {
    static let shared = Wordbook()
    private(set) var entries: [WordEntry] = []      // tombstone 포함(전체)

    /// 화면/검색용 — 삭제 안 된 항목만.
    var activeEntries: [WordEntry] { entries.filter { $0.deletedAt == nil } }
    /// 동기화용 — tombstone 포함 전체.
    func allForSync() -> [WordEntry] { entries }

    private var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("VocaNote", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("wordbook.json")
    }

    func load() {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601        // save() 가 .iso8601 로 쓰므로 맞춰야 함
        guard let data = try? Data(contentsOf: fileURL),
              let list = try? dec.decode([WordEntry].self, from: data) else { return }
        entries = list
    }

    private func save() {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        if let data = try? enc.encode(entries) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    private func notify(triggerSync: Bool) {
        NotificationCenter.default.post(name: .vocaWordbookChanged, object: nil)
        if triggerSync { SyncManager.shared.scheduleSync() }
    }

    @discardableResult
    func upsert(term: String, meaningKo: String) -> WordEntry {
        let norm = normalize(term)
        let now = Date()
        if let idx = entries.firstIndex(where: { $0.termNorm == norm }) {
            entries[idx].meaningKo = meaningKo
            entries[idx].updatedAt = now
            entries[idx].deletedAt = nil            // 되살리기
            save(); notify(triggerSync: true)
            return entries[idx]
        }
        let e = WordEntry(term: term, termNorm: norm, meaningKo: meaningKo, createdAt: now, updatedAt: now)
        entries.insert(e, at: 0)
        save(); notify(triggerSync: true)
        return e
    }

    func remove(termNorm: String) {
        if let idx = entries.firstIndex(where: { $0.termNorm == termNorm }) {
            let now = Date()
            entries[idx].deletedAt = now
            entries[idx].updatedAt = now
            save(); notify(triggerSync: true)
        }
    }

    func removeAll() {
        let now = Date()
        for i in entries.indices where entries[i].deletedAt == nil {
            entries[i].deletedAt = now
            entries[i].updatedAt = now
        }
        save(); notify(triggerSync: true)
    }

    /// 동기화 병합 결과를 통째로 반영 (tombstone 포함). 동기화 재유발 안 함.
    func applyMerged(_ merged: [WordEntry]) {
        entries = merged.sorted { $0.updatedAt > $1.updatedAt }
        save(); notify(triggerSync: false)
    }

    func contains(_ term: String) -> Bool {
        let n = normalize(term)
        return entries.contains { $0.termNorm == n && $0.deletedAt == nil }
    }

    /// 저장된 단어 중 프리픽스 매칭 (내 단어장 우선 노출용).
    func query(_ q: String, limit: Int = 6) -> [Suggestion] {
        let n = normalize(q)
        guard !n.isEmpty else { return [] }
        return entries
            .filter { $0.termNorm.hasPrefix(n) && $0.deletedAt == nil }
            .prefix(limit)
            .map { Suggestion(term: $0.term, meaningKo: $0.meaningKo, source: .wordbook) }
    }
}
