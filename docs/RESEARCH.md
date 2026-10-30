# 技術調査と採用方針

調査日：2026-10-30（日本時間）。公式資料の確認と実機検証は別です。iPhone実機はこの開発環境では操作できていません。

## 結論

TypeScriptの静的PWA＋IndexedDB＋ショートカットのCSV記録＋ファイル選択による手動取り込みを採用。実際の使用制限はiOS標準機能に任せます。ネイティブアプリ、独自サーバー、認証、外部分析、広告は追加していません。

## 機能の分類

|機能|分類|実装・条件|
|---|---|---|
|任意の記録ID・アプリ名・カテゴリ・目標の管理|完全に実装可能|PWAで管理。インストール済みアプリの列挙はしない|
|CSV/JSON取り込み、期間集計、グラフ、手動値優先|完全に実装可能|入力されたデータについて正しく算出|
|ローカル保存・バックアップ・復元・削除|完全に実装可能|IndexedDB。消失に備えてJSONを別途保存|
|アプリ起動・切り替えイベントの自動記録|条件付きで実装可能|対象アプリごとのショートカットと自動実行設定が必要|
|画面使用時間の推定|条件付きで実装可能|イベント時刻の差。OSの実測値ではない|
|ホーム画面・オフライン|条件付きで実装可能|HTTPS配信、初回オンライン読み込みとキャッシュ成功が必要|
|iCloudへの保存|条件付きで実装可能|ファイル保存アクション、フォルダ選択・権限・同期状態に依存|
|標準スクリーンタイムの使用時間を取り込む|代替手段を利用すれば実装可能|日別アプリ別の手動転記|
|1日上限・時間帯の実効的な制限|代替手段を利用すれば実装可能|iOSの設定を手動操作。PWAの目標とは同期しない|
|勉強中の利用分析|条件付きで実装可能|勉強区間と取り込み済みイベント区間の重なりだけ|
|PWAが他アプリを常時監視・強制停止|現在の環境では実装不可能|採用構成ではOS権限なし|
|iCloud DriveをPWAが無人で読んで同期|現在の環境では実装不可能|本構成ではファイル選択が必要|
|無料・WindowsのみでScreen Time APIのネイティブアプリを安定運用|現在の環境では実装不可能|Xcode・署名・必要な権限・開発者プログラムの条件がある|
|回避できない自己管理ブロック|現在の環境では実装不可能|所有者が設定・許可・パスコード等を変更できる|

「完全に実装可能」は入力データに対するアプリ機能の分類であり、全iPhoneでの実機検証済みを意味しません。

## イベントと精度

AppleのAppトリガーは対象を開く／そのアプリへ切り替えるとき、閉じる／そのアプリから切り替えるときに発火します[S1]。終了はプロセスの停止ではありません。画面ロック、強制終了、再起動、低電力、権限不足で必ず対になるとの保証は公式資料から確認できません。ログ時刻はトリガー発生そのものではなく、日付アクションを実行した時刻です。遅延により数秒以上の誤差があり得ます。誤差の上限は保証できません。

Appは自動実行可能なトリガーです[S2]。個々のアクションの権限は別途必要です。iOS 27資料ではエディタからオートメーションを追加する手順と、プライバシー設定のAllow Running When Lockedが案内されています[S3]。旧画面と新画面をSHORTCUTS_SETUP.mdで分けました。最新日本語版の全ラベル・アクション詳細を公式公開資料だけでは確認できなかったため、未確認部分を明示しています。

## 保存とWebの境界

ファイル保存アクションで利用者が選んだフォルダに書き込みます。共有CSVへの同時追記の競合を避け、標準手順は1イベント1ファイルです。これは開発上の判断です。PWA側はinput type=fileで利用者が選択したファイルだけ読みます。WebKitのOrigin Private File SystemはWebオリジン内の領域で、iCloud Drive全体へのアクセス権ではありません[S4]。IndexedDB等には消失リスクがあり、persistent storageの要求も許可を保証しません[S5]。

## 制限とネイティブAPI

iOS 27では「許容時間」と「スクリーンタイムのスケジュール」でカテゴリ単位の利用枠を設定できます。複数Appleデバイス／ファミリーの対応バージョン条件があります[S6]。旧画面の休止時間等は別資料で案内されています[S7]。集中モードは通知等の制御であり、本PWAではアプリ起動禁止の代用にしません。

Family Controlsは利用者の承認とentitlementが必要です[S8]。Managed Settingsは制限、Device Activityは監視／レポート等を担うネイティブの枠組みです[S9]。開発用の設定もApple Developer ProgramとXcodeの対象・拡張の署名が関係します。配布用Family Controls権限はApp Storeアプリ審査とは別の申請があり、App Storeに出さないことだけで署名・権限要件はなくなりません[S10]。無料Personal Teamはプロビジョニングが7日で失効し再ビルド・再インストールが必要なため、今回の保守負担と条件に合いません[S11]。PWAにはその署名は不要です。

## 公式資料

- [S1] Appトリガー（Apple）：https://support.apple.com/en-euro/guide/shortcuts/apde31e9638b/9.0/ios/26
- [S2] 自動実行（Apple・日本語）：https://support.apple.com/ja-jp/guide/shortcuts/apd602971e63/9.0/ios/26
- [S3] iOS 27オートメーション（Apple・英語）：https://support.apple.com/en-mo/guide/shortcuts/apdfbdbd7123/10.0/ios/27
- [S4] WebKitファイル領域：https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/
- [S5] WebKit保存ポリシー：https://webkit.org/blog/14403/updates-to-storage-policy/
- [S6] iOS 27の設定（Apple・日本語）：https://support.apple.com/ja-jp/guide/iphone/iphb0c7313c9/27/ios/27
- [S7] 従来の設定（Apple・日本語）：https://support.apple.com/ja-jp/guide/iphone/-iphb0c7313c9/ios
- [S8] Family Controls：https://developer.apple.com/documentation/familycontrols
- [S9] Configuring Family Controls：https://developer.apple.com/documentation/Xcode/configuring-family-controls
- [S10] 配布用権限：https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement
- [S11] 開発者アカウント：https://developer.apple.com/help/account/basics/about-your-developer-account

公式サポートのURLにはバージョン固定と最新版への参照が混在します。自動で別バージョンへ遷移する場合はページのバージョンを確認してください。一部の直接取得はHTTP 429等で失敗したため、公式ページの検索取得結果を併用しました。

## この納品版での再確認

2026-10-30にAppleのAppトリガー、自動実行、iOS 27のオートメーション、許容時間／スケジュール、Family Controls、Personal Teamの期限、WebKitの保存領域と永続化方針を再確認。日本語のiOS 27ショートカット全ラベルを確認できたとは扱わない。ファイル保存はiPhone向け英語資料でも確認：
https://support.apple.com/en-ca/guide/shortcuts/apdaf74d75a5/ios

無料GitHub Pagesの公開リポジトリ条件と配信手順：
https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

公開仕様の確認と、実際の端末における実行成功は別。ロック・強制終了の取りこぼし率や精度の数値は計測していない。
