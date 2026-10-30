# データモデルと集計設計

## モジュール

- src/core.ts：型、実行時バリデーション、CSVパーサー、重複排除、セッション推定、日本時間集計、勉強区間との交差。
- src/storage.ts：IndexedDBの非同期読み書き。1つのreadwriteトランザクション内でrevision確認と保存。
- src/app.ts：画面関数、チャート部品、フォームイベント、取り込み確認、バックアップUI。
- public/sw.js：ビルド時にファイル一覧・内容ハッシュを差し込む。cache-first、明示的更新。

TypeScript strictを有効にしています。サーバーへの履歴送信APIはありません。

## CSV

UTF-8。BOM・CRLF・LF・CSV引用符に対応。ヘッダーは次の順で固定して使います。ヘッダーなしの3列も読み込めます。

appId,type,at
video_app,open,2026-10-29T10:00:00.000+09:00
video_app,close,2026-10-29T10:30:00.000+09:00

- appId：1〜80文字の英数字・_・-。__proto__/constructor/prototypeは拒否。
- type：openまたはclose。
- at：オフセットまたはZが必要。内部ではUTCのISO文字列に正規化。
- 日時は2000年以降、現在時刻より5分超の未来を拒否。
- 日時不正、列不足、未終了引用符、重複ヘッダー等は読み込み全体を失敗させる。

JSONはイベント配列、単一イベント、または下の完全バックアップを受け付けます。JSON Linesは未対応。

## 完全バックアップ version 1

State = {
  version: 1,
  revision: number,
  apps: [{id, name, category, goal, avoid, archived}],
  events: [{appId, type, at}],
  manual: [{appId, day: "YYYY-MM-DD", minutes}],
  studies: [{id, start, end: string|null, avoid: string[]}],
  settings: {goal, theme: "auto"|"light"|"dark", maxSession},
  lastImport: string|null
}

goal/maxSession/minutesの単位は分。goalは1〜1440、maxSessionは1〜1440、manualは0〜1440。手動の(appId,day)は一意。参照先のアプリIDが必要。勉強区間の重複・終了逆転を拒否。未終了の勉強は最大1件。

revisionはローカルでの同時編集検知用。復元時の入力revisionをそのまま保存せず、現在の保存領域のrevisionから増やします。

## 推定セッション

Session = {appId, start: epochMs, end: epochMs|null, status: "paired"|"review", reason}

イベントを正規化して同一キーを排除後、時刻順に走査します。原則1つの前景アプリのみを追跡。別アプリの起動で現在のセッションを終端確定せず、要確認として除外。孤立した終了も除外。連続使用上限を超えたペアは切り詰めず全体を除外。

reviewが現在進行中か欠落かは判断できません。過去の欠落ファイルを後から取り込めば、全イベントから再構成してペアが回復します。

pairedを日本時間の日境界で分割し、手動値のあるappId/dayを除外して集計。その後手動値を1回だけ加算。時刻情報がない手動値を時間帯へ割り振りません。

内部はミリ秒で算出、通常画面は分以下を切り捨てて表示。棒をタップすると秒まで確認できます。グラフの表示丸めと内部の集計は別です。

## セキュリティ

- インポートはサイズ上限と構造検証を適用、適用前にプレビュー。
- 動的文字列はHTMLへ出す前にescape。IDは許可リスト方式。
- CSV出力は検証済みID・固定種別・ISO日時のみで、表示名などの任意文字列を含めない。
- CSPはscript self、object none、connect self。外部ライブラリをランタイムで読まない。
- PWAからの通常fetchは同一配信元の手順書とService Worker資産のみ。
- ファイル名に履歴の内容をURLパラメーターとして入れない。

## 集計可能日と要確認日の区別（1.0.1）

known は正常な推定ペア（0秒を含む）または手動転記が存在する日だけ。終了欠落・孤立終了のみの日は平均の分母に含めず、0分使用と解釈しない。要確認区間は開始日だけでなく、区間が交差するすべての日にissuesを付ける。未終了の最終セッションは現在までを要確認とし、孤立終了は点イベントとして扱う。issuesは時間の加算ではない。ペアが存在する日でも未記録時間の不存在は証明できない。
