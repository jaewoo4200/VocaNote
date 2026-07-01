import SwiftUI

extension Notification.Name { static let vocaShowTutorial = Notification.Name("VocaShowTutorial") }

/// 첫 실행(또는 설정에서 다시 보기) 시 뜨는 사용법 안내 카드.
struct TutorialOverlay: View {
    let onClose: () -> Void

    private let tips: [(String, String, String)] = [
        ("bolt.fill", "어디서나 열기", "⌥Space 로 검색창을 띄워요."),
        ("magnifyingglass", "즉시 검색", "타이핑하면 로컬 자동완성 + 다음/네이버 사전 뜻이 바로."),
        ("return", "저장 · 이동", "↵ 단어장 저장 · ↑↓ 이동 · esc 닫기."),
        ("cursorarrow.rays", "선택 단어 조회", "다른 앱에서 단어를 드래그하고 ⌃⌥Space."),
        ("books.vertical.fill", "단어장 · 설정", "상단 아이콘으로 바로 이동."),
        ("arrow.triangle.2.circlepath", "동기화", "설정에서 로그인하면 웹/폰과 자동 동기화.")
    ]

    var body: some View {
        ZStack {
            Color.black.opacity(0.30).ignoresSafeArea().onTapGesture(perform: onClose)
            VStack(alignment: .leading, spacing: 13) {
                HStack(spacing: 8) {
                    Image(systemName: "character.book.closed.fill").foregroundColor(.vocaBrand)
                    Text("VocaNote 사용법").font(.system(size: 17, weight: .bold)).foregroundColor(VocaTheme.text)
                }
                ForEach(tips.indices, id: \.self) { i in
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: tips[i].0).foregroundColor(.vocaBrand)
                            .font(.system(size: 13)).frame(width: 18)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(tips[i].1).font(.system(size: 13, weight: .semibold)).foregroundColor(VocaTheme.text)
                            Text(tips[i].2).font(.system(size: 12)).foregroundColor(VocaTheme.textMuted)
                        }
                    }
                }
                Button(action: onClose) {
                    Text("시작하기").font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Color.vocaBrand).foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: VocaTheme.rSm))
                }.buttonStyle(.plain).padding(.top, 2)
            }
            .padding(22)
            .frame(width: 380)
            .background(VocaTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: VocaTheme.rLg))
            .overlay(RoundedRectangle(cornerRadius: VocaTheme.rLg).strokeBorder(VocaTheme.border))
            .shadow(color: .black.opacity(0.22), radius: 26, y: 10)
        }
    }
}
