# Cancellation Oregonian Hearts

[![CI](https://github.com/chibakkk/cancellation-oregonian-hearts/actions/workflows/ci.yml/badge.svg)](https://github.com/chibakkk/cancellation-oregonian-hearts/actions/workflows/ci.yml)

リアルタイムで遊べる、4-10人用のトリックテイキングカードゲームです。  
現在のバージョン: `v0.1.0`

公開URL: [https://cancellation-oregonian-hearts-client.onrender.com/](https://cancellation-oregonian-hearts-client.onrender.com/)

## このゲームについて

Cancellation Oregonian Hearts は、2組のトランプを使うハーツ系のトリックテイキングです。

同じカードが複数枚存在するため、同一カードが出るとキャンセルが発生します。通常のマストフォローや失点カードに加えて、キャンセルによって勝敗候補から外れるカードを読むのが特徴です。

## ルール概要

- プレイ人数は4-10人です。
- 2組、合計104枚のトランプを使います。
- 104枚を人数で割って配り、余ったカードは最終トリックの勝者が引き取ります。余り札にハートやスペードQがあれば、その失点も含めて計算します。
- 各トリックでは、最初にカードを出したプレイヤーが親です。
- 基本はマストフォローです。リードスートを持っている場合は、そのスートを出す必要があります。
- リードスートを持っていないプレイヤーが別スートを出した場合、そのカード以降の比較対象スートが変わることがあります。
- 同じスート・同じランクのカードが複数出ると、そのカードはキャンセルされ、トリックの勝敗から除外されます。
- 勝敗候補がすべてキャンセルされた場合は、そのトリックの親が勝ちます。
- ハートは1枚につき `-1` 点です。
- スペードQは `-13` 点です。
- 失点カードを1枚も取らなかったプレイヤーには、ラウンド終了時にボーナスが入ります。ボーナスは `52 + 持ち越し点` を無失点者数で割った整数点で、余りは次ラウンドへ持ち越します。
- 全員 `100` 点から開始し、各ラウンドの増減を累計します。
- 全ラウンド終了後、合計点で順位を決めます。

アプリ内でもトップページの「ルールを見る」から確認できます。

## 遊び方

1. 公開URLを開きます。
2. ルームを作る人は「ルームを作成する」から、名前と4桁パスワードを入力してルームを作成します。
3. 参加者には、ゲーム画面に表示される5文字のルームIDと4桁パスワードを共有します。
4. 参加者はトップページから、名前、ルームID、パスワードを入力して参加します。
5. 4人以上集まったらホストがゲームを開始します。

同じブラウザであれば、タブを閉じてもトップページの復帰導線から戻れる場合があります。

## 現在の注意点

- Render の無料枠では、アクセスがない時間が続くとサーバーがスリープすることがあります。
- スリープ後の初回アクセスでは、起動まで数十秒かかる場合があります。
- 現在は友人との公開テスト向けです。本格公開前に、スマホ表示やルール説明をさらに整備する予定です。

## リポジトリ構成

- `client`: React / Vite のブラウザクライアント
- `server`: Node.js / Socket.IO のゲームサーバー
- `scripts`: Compose や公開URL確認用の補助スクリプト
- `docs`: セキュリティ/運用メモ

サーバーはルーム状態、ターン、合法手判定、得点計算、セッション復帰の正本です。公開環境では Redis を使ってルーム状態とセッショントークンを保持します。

## ローカル開発

依存関係をインストールします。

```powershell
cd server
npm install

cd ..\client
npm install
```

サーバーとクライアントを別ターミナルで起動します。

```powershell
cd server
npm run start
```

```powershell
cd client
npm run dev
```

Vite が表示したURLを開きます。デフォルトではクライアントは `http://localhost:3001` のサーバーへ接続します。

## Docker Compose

Redis を含む本番に近いローカル構成で起動できます。

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Compose のスモークテストを1コマンドで実行する場合:

```powershell
.\scripts\compose-smoke.ps1
```

確認後も起動したままにしたい場合:

```powershell
.\scripts\compose-smoke.ps1 -KeepRunning
```

デフォルトURL:

- Client: `http://localhost:8080`
- Server: `http://localhost:3001`
- Server readiness: `http://localhost:3001/ready`

Compose 構成では `client`, `server`, `redis` の3サービスを起動します。Redis はルーム状態、セッショントークン、部屋ごとの排他制御、レート制限に使います。

## 環境変数

`.env.example` をデプロイ設定の元にしてください。

クライアント:

- `VITE_SERVER_URL`: Socket.IO サーバーのURL。例: `https://coh-server.example.com`

サーバー:

- `PORT`: HTTP / Socket.IO の待受ポート。デフォルトは `3001`。
- `CORS_ORIGIN`: 接続を許可するブラウザのオリジン。本番では公開クライアントURLを設定します。
- `COH_TRUST_PROXY_HEADERS`: Render など信頼できるリバースプロキシ配下でのみ `true` にします。
- `REDIS_URL`: Redis 接続URL。設定するとルーム状態とレート制限に Redis を使います。
- `COH_STATE_BACKEND`: `memory` にすると状態を永続化しません。公開環境では使わないでください。
- `COH_STATE_DIR`: Redis 未使用時のJSONルーム状態ディレクトリ。
- `COH_STATE_FILE`: 旧JSON状態ファイルの移行/フォールバック用パス。
- `COH_ROOM_TTL_MS`: 非アクティブなルームの有効期限。デフォルトは24時間。
- `COH_ROOM_CLEANUP_INTERVAL_MS`: 期限切れルームの定期削除間隔。デフォルトは1時間。
- `COH_REDIS_KEY_PREFIX`: Redis キーのプレフィックス。
- `COH_REDIS_LOCK_TTL_MS`: Redis の部屋別ロックTTL。
- `COH_JOIN_ROOM_ATTEMPT_LIMIT`: ルーム参加試行の制限回数。
- `COH_JOIN_ROOM_ATTEMPT_WINDOW_MS`: ルーム参加試行の制限ウィンドウ。
- `COH_RESUME_SESSION_ATTEMPT_LIMIT`: セッション復帰試行の制限回数。
- `COH_RESUME_SESSION_ATTEMPT_WINDOW_MS`: セッション復帰試行の制限ウィンドウ。

## 永続化

サーバーは3つの永続化モードに対応しています。

- Redis: `REDIS_URL` を設定します。公開環境ではこれを推奨します。
- JSONファイル: `REDIS_URL` を設定しない場合のローカル開発向けです。
- Memory: `COH_STATE_BACKEND=memory`。再起動で状態が消えます。

公開環境では Redis を使うことで、サーバープロセスの再起動や再デプロイ後もルーム状態とセッショントークンを復帰しやすくしています。

## テスト

サーバーテスト:

```powershell
cd server
npm test
```

クライアントビルド:

```powershell
cd client
npm run build
```

E2E:

```powershell
cd client
npm run test:e2e
```

Compose 起動済み環境へのE2E:

```powershell
.\scripts\compose-smoke.ps1 -KeepRunning

cd client
npm run test:e2e:compose

cd ..
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

公開URLへのスモークE2E:

```powershell
.\scripts\public-e2e.ps1 `
  -ClientUrl https://your-client.example.com `
  -ServerUrl https://your-server.example.com
```

## CI

GitHub Actions は `.github/workflows/ci.yml` で定義しています。

CIでは次を確認します。

- Server dependency install
- Client dependency install
- Playwright Chromium install
- Server tests
- Server build
- Client build
- Playwright E2E

Compose smoke test と公開URL E2E は Docker やデプロイ済みURLが必要なため、明示的なデプロイ前チェックとして扱います。

## デプロイ

このリポジトリには Render Blueprint の `render.yaml` を含めています。

Render 構成:

- `cancellation-oregonian-hearts-server`: Socket.IO サーバー
- `cancellation-oregonian-hearts-client`: Vite ビルドの静的サイト
- `cancellation-oregonian-hearts-redis`: ルーム、セッション、ロック、レート制限用の Key Value

現在の公開URL:

- Client: `https://cancellation-oregonian-hearts-client.onrender.com`
- Server: `https://cancellation-oregonian-hearts-server.onrender.com`

本番用の環境変数例:

```env
VITE_SERVER_URL=https://your-server.example.com
PORT=3001
CORS_ORIGIN=https://your-client.example.com
COH_TRUST_PROXY_HEADERS=true
REDIS_URL=rediss://default:password@your-redis-host:6379
COH_REDIS_KEY_PREFIX=coh-prod
COH_REDIS_LOCK_TTL_MS=10000
COH_ROOM_TTL_MS=86400000
COH_ROOM_CLEANUP_INTERVAL_MS=3600000
COH_JOIN_ROOM_ATTEMPT_LIMIT=12
COH_JOIN_ROOM_ATTEMPT_WINDOW_MS=60000
COH_RESUME_SESSION_ATTEMPT_LIMIT=30
COH_RESUME_SESSION_ATTEMPT_WINDOW_MS=60000
```

Render の無料枠では Redis の永続化設定やサーバーのスリープ挙動に制限があります。公開テストを超えて安定運用する場合は、有料プランや永続化設定の見直しが必要です。

## デプロイ前チェックリスト

- `cd server && npm test`
- `cd server && npm run build`
- `cd client && npm run build`
- `cd client && npm run test:e2e`
- GitHub Actions CI が成功している
- `.\scripts\compose-smoke.ps1`
- `cd client && npm run test:e2e:compose`
- 公開後に `.\scripts\public-e2e.ps1 -ClientUrl ... -ServerUrl ...`
- デプロイ先が WebSocket に対応している
- `VITE_SERVER_URL` と `CORS_ORIGIN` が正しい
- `REDIS_URL` が設定され、`/ready` が Redis-backed を返す
- `COH_REDIS_KEY_PREFIX` が環境ごとに分かれている
- ルームTTLが遊び方に合っている
- `docs/security-release-review.md` のリスク棚卸しを確認する

## 変更履歴

変更履歴は [CHANGELOG.md](./CHANGELOG.md) にまとめています。

## ライセンス

現時点ではライセンス方針は未整理です。公開範囲を広げる前に明記する予定です。
