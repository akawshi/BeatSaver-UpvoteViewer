// ==UserScript==
// @name         BeatSaver-UpvoteViewer
// @namespace    https://example.com/
// @version      1.0.1
// @description  BeatSaverのマップページにサムズアップアイコンを追加し、クリックした時だけAPIからupvote数を取得して表示する
// @match        https://beatsaver.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.beatsaver.com
// @run-at       document-idle
// ==/UserScript==
(function () {
    'use strict';
    const ICON_ID = 'bs-upvote-display';

    // URLからマップID（例: /maps/53e1c → 53e1c）を取り出す
    function getMapId() {
        const m = location.pathname.match(/\/maps\/([^/]+)/);
        return m ? m[1] : null;
    }

    // download link の <a> 要素を探す。
    // 優先順位: (1) CDNのzipへの直リンク (2) title/aria-label (3) アイコンの class
    function findDownloadLink() {
        // (1) 実ページで確認済み: href は https://r2cdn.beatsaver.com/<hash>.zip（クエリなし）
        const byHref = document.querySelector(
            'a[href^="https://r2cdn.beatsaver.com/"][href$=".zip"], a[href*="beatsaver.com/"][href$=".zip"]'
        );
        if (byHref) return byHref;

        // (2) title / aria-label
        const byLabel = document.querySelector(
            'a[title="Download zip" i], a[aria-label="Download zip" i]'
        );
        if (byLabel) return byLabel;

        // (3) アイコン（<i> の場合と、FAのJSで <svg> 化されている場合の両対応）
        const icon = document.querySelector(
            'a i.fa-download, a svg.fa-download, a i.text-info'
        );
        return icon ? icon.closest('a') : null;
    }

    // サムズアップアイコン用の <i> を作る。
    // 元アイコンのスタイル接頭辞（fa-solid / fas 等）と色クラス（text-info）だけを引き継ぎ、
    // アイコン名の class は fa-thumbs-up に差し替える。
    function makeThumbsUpIcon(origIcon) {
        const STYLE_CLASSES = ['fa', 'fas', 'far', 'fab', 'fa-solid', 'fa-regular', 'fa-brands', 'text-info'];
        const origClasses = origIcon ? (origIcon.getAttribute('class') || '').split(/\s+/) : [];
        const keep = origClasses.filter((c) => STYLE_CLASSES.includes(c));
        if (!keep.some((c) => c.startsWith('fa'))) keep.push('fa-solid');
        const i = document.createElement('i');
        i.className = [...new Set([...keep, 'fa-thumbs-up'])].join(' ');
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    // JSONを取得する。
    // beatsaver.com の CSP は connect-src 'self' のため、ページ内 fetch では
    // api.beatsaver.com へ接続できない。GM_xmlhttpRequest はページのCSPの
    // 対象外なので、使える環境ではそちらを優先する。
    function requestJson(url) {
        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers: { Accept: 'application/json' },
                    timeout: 15000,
                    onload: (res) => {
                        if (res.status < 200 || res.status >= 300) {
                            reject(new Error(`HTTP ${res.status}`));
                            return;
                        }
                        try {
                            resolve(JSON.parse(res.responseText));
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: () => reject(new Error('network error')),
                    ontimeout: () => reject(new Error('timeout')),
                });
            });
        }
        return fetch(url).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        });
    }

    function buildControl(downloadLink, mapId) {
        const el = downloadLink.cloneNode(true);
        el.id = ICON_ID;
        el.removeAttribute('href'); // zip をダウンロードしないようリンク先は外す
        el.removeAttribute('download');
        el.removeAttribute('target');
        el.removeAttribute('rel');
        el.title = 'upvote数を表示';
        el.setAttribute('aria-label', 'upvote数を表示');
        el.setAttribute('role', 'button');
        el.style.cursor = 'pointer';
        el.dataset.mapId = mapId; // 現在のmapIdを記録しておく

        // 中身はサムズアップアイコン＋数表示用spanだけにする
        const origIcon = el.querySelector('i, svg');
        const icon = makeThumbsUpIcon(origIcon);
        const count = document.createElement('span');
        count.className = 'bs-upvote-count';
        el.replaceChildren(icon, count);

        el.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (el.dataset.loading === '1') return; // 取得中の連打は無視
            el.dataset.loading = '1';
            count.textContent = ' …';
            try {
                const data = await requestJson(`https://api.beatsaver.com/maps/id/${mapId}`);
                const up = data && data.stats ? data.stats.upvotes : null;
                if (up === null || up === undefined) {
                    count.textContent = ' ?';
                    el.title = 'upvote数を取得できませんでした（クリックで再試行）';
                } else {
                    count.textContent = ` ${up}`;
                    el.title = `upvote数: ${up}（クリックで再取得）`;
                }
            } catch (e) {
                count.textContent = ' !';
                el.title = `取得に失敗しました: ${e && e.message ? e.message : e}（クリックで再試行）`;
            } finally {
                delete el.dataset.loading;
            }
        });
        return el;
    }

    function addControl() {
        const mapId = getMapId();
        const existing = document.getElementById(ICON_ID);

        // マップページでなければ残骸を消して終わる
        if (!mapId) {
            if (existing) existing.remove();
            return;
        }

        // 既存コントロールがあり、DOMに繋がっていて、mapIdも一致していれば何もしない
        if (existing && existing.isConnected && existing.dataset.mapId === mapId) {
            return;
        }

        // 古いコントロール（別ページの残骸 or 切り離された要素）は先に削除
        if (existing) {
            existing.remove();
        }

        const downloadLink = findDownloadLink();
        if (!downloadLink) return; // download link がまだ描画されていない場合は次のチェックで再試行

        const control = buildControl(downloadLink, mapId);
        downloadLink.insertAdjacentElement('afterend', control);
    }

    function start() {
        // SPAの再描画を監視する。
        // 間引きは setTimeout で行う（requestAnimationFrame は非表示タブで止まるため使わない）
        let timer = null;
        const schedule = () => {
            if (timer !== null) return;
            timer = setTimeout(() => {
                timer = null;
                addControl();
            }, 50);
        };
        const observer = new MutationObserver(schedule);
        // body ではなく documentElement を監視する（body が差し替わっても監視が切れないように）
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // ウォッチドッグ: 監視で取りこぼしても1秒ごとに自己復旧する
        setInterval(addControl, 1000);

        // pushState/replaceState によるURL変更もフックしておく（DOM変化が遅れるケースの保険）
        ['pushState', 'replaceState'].forEach((fn) => {
            const orig = history[fn];
            history[fn] = function (...args) {
                const ret = orig.apply(this, args);
                setTimeout(addControl, 0);
                return ret;
            };
        });
        window.addEventListener('popstate', () => setTimeout(addControl, 0));
        window.addEventListener('load', () => setTimeout(addControl, 0));

        addControl();
    }

    // documentElement さえあれば開始できる。無い場合だけ DOMContentLoaded を待つ
    if (document.documentElement) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
