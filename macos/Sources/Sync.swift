import Foundation
import Combine

// ============================================================================
// voca.ljw.app(웹)과 동일한 Supabase 프로젝트/포맷으로 단어장 동기화.
//   • 이메일 OTP 로그인 → JWT (키체인 저장, 자동 갱신)
//   • sync_vaults.payload(jsonb) = BackupPayload (src/types.ts 와 1:1)
//   • 병합 규칙은 웹 src/lib/merge.ts 그대로 포팅 (LWW + sticky delete)
// ============================================================================

// MARK: - 웹 동기화 포맷 (src/types.ts)
// ⚠️ 디코딩은 관대하게(decodeIfPresent): 웹 normalizeEntry 가 favorite 등 일부 필드를
//    기본값 처리하지 않아 레거시/수동 레코드엔 키가 아예 없을 수 있음. 엄격 디코딩이면
//    항목 하나 때문에 pull 전체가 실패해 동기화가 통째로 멈춘다.
struct AbbrExpansion: Codable {
    var id: String
    var fullExpansion: String
    var meaningKo: String?
    var domains: [String]
    var tags: [String]
    var notes: String
    var favorite: Bool
    var updatedAt: Int
    var deletedAt: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        fullExpansion = try c.decodeIfPresent(String.self, forKey: .fullExpansion) ?? ""
        meaningKo = try c.decodeIfPresent(String.self, forKey: .meaningKo)
        domains = try c.decodeIfPresent([String].self, forKey: .domains) ?? []
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
        notes = try c.decodeIfPresent(String.self, forKey: .notes) ?? ""
        favorite = try c.decodeIfPresent(Bool.self, forKey: .favorite) ?? false
        updatedAt = try c.decodeIfPresent(Int.self, forKey: .updatedAt) ?? 0
        deletedAt = try c.decodeIfPresent(Int.self, forKey: .deletedAt)
    }
}

struct VocabEntry: Codable {
    var stableKey: String
    var type: String            // "word" | "abbr"
    var term: String
    var termNorm: String
    var meaningKo: String?
    var tags: [String]
    var notes: String
    var favorite: Bool
    var expansions: [AbbrExpansion]
    var priorityExpansionId: String?
    var createdAt: Int          // ms epoch
    var updatedAt: Int
    var deletedAt: Int?

    init(stableKey: String, type: String, term: String, termNorm: String, meaningKo: String?,
         tags: [String], notes: String, favorite: Bool, expansions: [AbbrExpansion],
         priorityExpansionId: String?, createdAt: Int, updatedAt: Int, deletedAt: Int?) {
        self.stableKey = stableKey; self.type = type; self.term = term; self.termNorm = termNorm
        self.meaningKo = meaningKo; self.tags = tags; self.notes = notes; self.favorite = favorite
        self.expansions = expansions; self.priorityExpansionId = priorityExpansionId
        self.createdAt = createdAt; self.updatedAt = updatedAt; self.deletedAt = deletedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        stableKey = try c.decode(String.self, forKey: .stableKey)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "word"
        term = try c.decodeIfPresent(String.self, forKey: .term) ?? ""
        termNorm = try c.decodeIfPresent(String.self, forKey: .termNorm) ?? ""
        meaningKo = try c.decodeIfPresent(String.self, forKey: .meaningKo)
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
        notes = try c.decodeIfPresent(String.self, forKey: .notes) ?? ""
        favorite = try c.decodeIfPresent(Bool.self, forKey: .favorite) ?? false
        expansions = try c.decodeIfPresent([AbbrExpansion].self, forKey: .expansions) ?? []
        priorityExpansionId = try c.decodeIfPresent(String.self, forKey: .priorityExpansionId)
        createdAt = try c.decodeIfPresent(Int.self, forKey: .createdAt) ?? 0
        updatedAt = try c.decodeIfPresent(Int.self, forKey: .updatedAt) ?? 0
        deletedAt = try c.decodeIfPresent(Int.self, forKey: .deletedAt)
    }
}

struct HistoryRecord: Codable {
    var termNorm: String
    var term: String
    var lastSeenAt: Int
    var seenCount: Int
}

struct BackupPayload: Codable {
    var schemaVersion: Int
    var exportedAt: String
    var entries: [VocabEntry]
    var history: [HistoryRecord]

    init(schemaVersion: Int, exportedAt: String, entries: [VocabEntry], history: [HistoryRecord]) {
        self.schemaVersion = schemaVersion; self.exportedAt = exportedAt
        self.entries = entries; self.history = history
    }

    // 항상 성공하며 언키드 컨테이너 인덱스만 전진시키는 스킵용 타입
    private struct Discard: Decodable { init(from decoder: Decoder) throws {} }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        exportedAt = try c.decodeIfPresent(String.self, forKey: .exportedAt) ?? ""
        history = (try? c.decodeIfPresent([HistoryRecord].self, forKey: .history)) ?? []
        // entries 는 lossy 디코딩: 깨진 레코드 하나가 pull 전체를 실패시키지 않게 건너뜀
        var out: [VocabEntry] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: .entries) {
            while !arr.isAtEnd {
                if let e = try? arr.decode(VocabEntry.self) { out.append(e) }
                else { _ = try? arr.decode(Discard.self) }
            }
        }
        entries = out
    }
}

private struct VaultUpsert: Codable { var owner_id: String; var payload: BackupPayload }
private struct VaultRow: Codable { var payload: BackupPayload; var updated_at: String? }
private struct AuthUser: Codable { var id: String; var email: String? }
private struct AuthResponse: Codable {
    var access_token: String?
    var refresh_token: String?
    var expires_at: Int?        // seconds epoch
    var expires_in: Int?
    var token_type: String?
    var user: AuthUser?
}

struct SyncSession: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Int          // ms epoch
    var userId: String
    var email: String?
}

enum SyncError: LocalizedError {
    case notConfigured, needsLogin, message(String)
    var errorDescription: String? {
        switch self {
        case .notConfigured: return "동기화 설정이 없습니다(빌드에 Supabase 키 미포함)."
        case .needsLogin: return "먼저 로그인해주세요."
        case .message(let m): return m
        }
    }
}

// MARK: - 동기화 매니저
final class SyncManager: ObservableObject {
    static let shared = SyncManager()

    @Published var isSignedIn = false
    @Published var email: String = ""
    @Published var syncing = false
    @Published var status: String = ""

    private var session: SyncSession?
    private let sessionAccount = "session"
    private var debounce: DispatchWorkItem?
    private var lastSyncStarted = Date.distantPast

    var isConfigured: Bool { SupabaseConfig.isConfigured }

    init() { loadSession() }

    // MARK: 세션 저장/복원 (키체인)
    private func loadSession() {
        if let data = Keychain.get(account: sessionAccount),
           let s = try? JSONDecoder().decode(SyncSession.self, from: data) {
            session = s
            publish { self.isSignedIn = true; self.email = s.email ?? "" }
        }
    }

    private func store(_ s: SyncSession?) {
        session = s
        if let s = s, let data = try? JSONEncoder().encode(s) { Keychain.set(data, account: sessionAccount) }
        else { Keychain.delete(account: sessionAccount) }
        publish {
            self.isSignedIn = s != nil
            self.email = s?.email ?? ""
            if s == nil { self.status = "" }
        }
    }

    private func publish(_ block: @escaping () -> Void) {
        if Thread.isMainThread { block() } else { DispatchQueue.main.async(execute: block) }
    }

    // MARK: 인증 (이메일 OTP)
    func sendOtp(_ email: String) async throws {
        guard isConfigured else { throw SyncError.notConfigured }
        _ = try await post("/auth/v1/otp", body: ["email": email, "create_user": true], token: nil)
    }

    func verifyOtp(_ email: String, code: String) async throws {
        guard isConfigured else { throw SyncError.notConfigured }
        let data = try await post("/auth/v1/verify",
                                  body: ["email": email, "token": code, "type": "email"], token: nil)
        try applyAuth(data, fallbackEmail: email)
    }

    func signOut() {
        if let s = session {
            Task { try? await self.post("/auth/v1/logout", body: [:], token: s.accessToken) }
        }
        store(nil)
    }

    private func applyAuth(_ data: Data, fallbackEmail: String?) throws {
        let auth = try JSONDecoder().decode(AuthResponse.self, from: data)
        guard let at = auth.access_token, let rt = auth.refresh_token, let uid = auth.user?.id else {
            throw SyncError.message("로그인 응답이 올바르지 않습니다.")
        }
        let expMs = auth.expires_at.map { $0 * 1000 }
            ?? (nowMs() + max(auth.expires_in ?? 3600, 60) * 1000)
        store(SyncSession(accessToken: at, refreshToken: rt, expiresAt: expMs,
                          userId: uid, email: auth.user?.email ?? fallbackEmail))
    }

    private func validSession() async throws -> SyncSession {
        guard let s = session else { throw SyncError.needsLogin }
        if s.expiresAt > nowMs() + 30_000 { return s }
        // 토큰 갱신
        let data = try await post("/auth/v1/token?grant_type=refresh_token",
                                  body: ["refresh_token": s.refreshToken], token: nil)
        try applyAuth(data, fallbackEmail: s.email)
        guard let fresh = session else { throw SyncError.needsLogin }
        return fresh
    }

    // MARK: 동기화 (pull → merge → apply → push)
    /// 패널 열기 등 자주 불리는 곳에서 — 마지막 동기화 후 minInterval 지났을 때만.
    func syncIfStale(_ minInterval: TimeInterval = 15) {
        guard isConfigured, session != nil else { return }
        guard Date().timeIntervalSince(lastSyncStarted) >= minInterval else { return }
        Task { await syncNow() }
    }

    // 단일 실행(single-flight) 보장: 동시에 여러 곳(패널 열기 · 디바운스 · 수동 버튼)에서
    // 불려도 한 번만 돈다. 겹친 요청은 pendingRerun 으로 합쳐져 끝난 뒤 1회 재실행.
    // (동시 실행 시 refresh 토큰이 이중 회전되어 세션이 깨질 수 있음 — Supabase는 rotation)
    private var syncInFlight = false
    private var pendingRerun = false

    func syncNow() async {
        guard isConfigured, session != nil else { return }
        let acquired = await MainActor.run { () -> Bool in
            if syncInFlight { pendingRerun = true; return false }
            syncInFlight = true
            return true
        }
        guard acquired else { return }
        repeat {
            await performSync()
        } while await MainActor.run(body: { () -> Bool in
            if pendingRerun { pendingRerun = false; return true }
            syncInFlight = false
            return false
        })
    }

    private func performSync() async {
        lastSyncStarted = Date()
        publish { self.syncing = true; self.status = "동기화 중…" }
        do {
            let s = try await validSession()
            let remote = try await pull(s)
            let payload = await MainActor.run { self.mergeAndBuildPayload(remote: remote) }
            try await push(s, payload)
            let n = payload.entries.filter { $0.type == "word" && $0.deletedAt == nil }.count
            publish { self.syncing = false; self.status = "동기화됨 · 단어 \(n)개" }
        } catch {
            publish { self.syncing = false; self.status = "동기화 실패: \(error.localizedDescription)" }
        }
    }

    /// 단어 저장/삭제 후 호출 — 1.5초 디바운스로 자동 업로드.
    func scheduleSync() {
        guard isConfigured, session != nil else { return }
        debounce?.cancel()
        let work = DispatchWorkItem { Task { await self.syncNow() } }
        debounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    // MARK: REST
    private func post(_ path: String, body: [String: Any], token: String?) async throws -> Data {
        var req = URLRequest(url: URL(string: SupabaseConfig.url + path)!)
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token ?? SupabaseConfig.anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !body.isEmpty { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, resp) = try await URLSession.shared.data(for: req)
        try check(resp, data)
        return data
    }

    private func pull(_ s: SyncSession) async throws -> BackupPayload? {
        let path = "/rest/v1/sync_vaults?select=payload,updated_at&owner_id=eq.\(s.userId)"
        var req = URLRequest(url: URL(string: SupabaseConfig.url + path)!)
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        try check(resp, data)
        return (try JSONDecoder().decode([VaultRow].self, from: data)).first?.payload
    }

    private func push(_ s: SyncSession, _ payload: BackupPayload) async throws {
        let path = "/rest/v1/sync_vaults?on_conflict=owner_id"
        var req = URLRequest(url: URL(string: SupabaseConfig.url + path)!)
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONEncoder().encode([VaultUpsert(owner_id: s.userId, payload: payload)])
        let (data, resp) = try await URLSession.shared.data(for: req)
        try check(resp, data)
    }

    private func check(_ resp: URLResponse, _ data: Data) throws {
        guard let http = resp as? HTTPURLResponse else { throw SyncError.message("응답 없음") }
        guard (200..<300).contains(http.statusCode) else {
            var msg = "HTTP \(http.statusCode)"
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                msg = (obj["msg"] ?? obj["error_description"] ?? obj["error"] ?? obj["message"]) as? String ?? msg
            }
            throw SyncError.message(msg)
        }
    }

    // MARK: 병합 (웹 merge.ts 포팅) — word 타입만 관리, 나머지(약어 등)는 서버 값 보존
    private func mergeAndBuildPayload(remote: BackupPayload?) -> BackupPayload {
        let remoteEntries = remote?.entries ?? []
        let remoteWords = remoteEntries.filter { $0.type == "word" }
        let remoteOthers = remoteEntries.filter { $0.type != "word" }
        var remoteWordByKey: [String: VocabEntry] = [:]
        for e in remoteWords { remoteWordByKey[e.stableKey] = e }

        let localVocab: [VocabEntry] = Wordbook.shared.allForSync().map { w in
            let key = "\(webNormalizeTerm(w.term))::word"
            let up = ms(w.updatedAt), cr = ms(w.createdAt)
            let del = w.deletedAt.map { ms($0) }
            if var base = remoteWordByKey[key] {
                // 로컬이 더 최신이면 뜻/시각/삭제만 갱신 — 서버의 태그/메모/즐겨찾기는 보존
                if up >= base.updatedAt || (del ?? 0) > (base.deletedAt ?? 0) {
                    base.term = w.term
                    base.meaningKo = w.meaningKo
                    base.updatedAt = up
                    base.deletedAt = del
                    base.createdAt = min(base.createdAt, cr)
                }
                return base
            }
            return VocabEntry(stableKey: key, type: "word", term: w.term, termNorm: webNormalizeTerm(w.term),
                              meaningKo: w.meaningKo, tags: [], notes: "", favorite: false,
                              expansions: [], priorityExpansionId: nil, createdAt: cr, updatedAt: up, deletedAt: del)
        }

        let mergedWords = mergeEntries(remoteWords, localVocab)

        // 로컬 단어장에 반영 (word 타입만; 삭제 tombstone 포함)
        let applied: [WordEntry] = mergedWords.map { v in
            WordEntry(term: v.term, termNorm: normalize(v.term), meaningKo: v.meaningKo ?? "",
                      createdAt: date(v.createdAt), updatedAt: date(v.updatedAt),
                      deletedAt: v.deletedAt.map { date($0) })
        }
        Wordbook.shared.applyMerged(applied)

        return BackupPayload(schemaVersion: remote?.schemaVersion ?? 1,
                             exportedAt: iso(Date()),
                             entries: remoteOthers + mergedWords,
                             history: remote?.history ?? [])
    }

    private func clock(_ e: VocabEntry) -> Int { max(e.updatedAt, e.deletedAt ?? 0) }

    private func mergeEntry(_ l: VocabEntry, _ r: VocabEntry) -> VocabEntry {
        var w = clock(r) > clock(l) ? r : l
        let lo = clock(r) > clock(l) ? l : r
        let del = max(l.deletedAt ?? 0, r.deletedAt ?? 0)
        w.tags = Array(Set(w.tags + lo.tags))
        w.createdAt = min(l.createdAt, r.createdAt)
        w.deletedAt = del == 0 ? nil : del
        w.updatedAt = max(l.updatedAt, r.updatedAt, del)
        if w.priorityExpansionId == nil { w.priorityExpansionId = lo.priorityExpansionId }
        return w
    }

    private func mergeEntries(_ left: [VocabEntry], _ right: [VocabEntry]) -> [VocabEntry] {
        var map: [String: VocabEntry] = [:]
        for e in left { map[e.stableKey] = e }
        for e in right {
            if let x = map[e.stableKey] { map[e.stableKey] = mergeEntry(x, e) } else { map[e.stableKey] = e }
        }
        return Array(map.values)
    }

    // MARK: 유틸
    private func nowMs() -> Int { Int(Date().timeIntervalSince1970 * 1000) }
    private func ms(_ d: Date) -> Int { Int(d.timeIntervalSince1970 * 1000) }
    private func date(_ ms: Int) -> Date { Date(timeIntervalSince1970: Double(ms) / 1000) }
    private func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }
    // 웹 normalizeTerm 과 동일: NFKC + trim + lowercase + 공백 축약
    private func webNormalizeTerm(_ s: String) -> String {
        s.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }
}
