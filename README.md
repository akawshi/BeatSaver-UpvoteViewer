# BeatSaver-UpvoteViewer

## これは何

BeatSaver のマップページ上に `!` アイコンを表示し、クリックするとそのマップの Upvote 数を BeatSaver API 経由でカウントして表示します
作成にあたって Muse を使っています

## 使い方
`user.js` を Tampermonkey でインストールしてください。Tampermonkey の具体的な使い方は省略
Stylus や uBlock Origin などを使って普段 vote 数を非表示にしているひと向けのユーザースクリプトです

## vote 非表示
uBlock Origin で以下のコードを「マイフィルタ」に貼り付けてください

```
beatsaver.com##div.list-group-item.d-flex.justify-content-between:has-text(Rating)
beatsaver.com##div > small[class="text-center vote"]
beatsaver.com##div.percentage
```

