/* =====================================================================
   莉映の期末対策クイズ → 家族LINEグループ「1日1回まとめて」自動投稿
   ---------------------------------------------------------------------
   ・クイズから届く各単元の結果は、その都度ためておく（無料）。
   ・1日3回（18時・20時・23時）に、たまっている分をまとめて1通だけ送る（課金はここだけ）。
   使い方は「LINE設定ガイド.md」を参照。
   CHANNEL_ACCESS_TOKEN に Messaging API の「チャネルアクセストークン（長期）」を貼る。
   設定後、関数 setupDailyTrigger を一度だけ実行（1日3回のまとめ送信を予約）。
   ===================================================================== */

var CHANNEL_ACCESS_TOKEN = "ここに_チャネルアクセストークン_を貼る";

var PROPS = PropertiesService.getScriptProperties();

/* クイズ／LINEからのPOST受け口 */
function doPost(e){
  var body = (e && e.postData) ? e.postData.contents : "";

  // ⓪ 達成状況スナップショットの保存（クイズのトップページから届く）
  if (body.indexOf("#SNAPSHOT#") === 0) {
    PROPS.setProperty("SNAPSHOT", body.substring(10));
    return ContentService.createTextOutput("ok");
  }

  var json = null;
  try { json = JSON.parse(body); } catch (err) {}

  // ① LINEのWebhook
  if (json && json.events) {
    json.events.forEach(function(ev){
      var gid = ev.source && ev.source.groupId;
      // 初回（未登録）のときだけグループ登録＆返信
      if (gid && PROPS.getProperty("GROUP_ID") !== gid) {
        PROPS.setProperty("GROUP_ID", gid);
        if (ev.replyToken) {
          reply(ev.replyToken, "✅ このグループを登録しました。1日3回（18時・20時・23時）に学習まとめが届きます！");
        }
      }
      // 「進捗」「状況」と送られたら、現在の達成状況を返信
      if (ev.type === "message" && ev.message && ev.message.type === "text" && ev.replyToken) {
        var t = ev.message.text || "";
        if (t.indexOf("進捗") >= 0 || t.indexOf("状況") >= 0 || t.indexOf("しんちょく") >= 0) {
          reply(ev.replyToken, progressText());
        }
      }
    });
    return ContentService.createTextOutput("ok");
  }

  // ② クイズの結果（プレーンテキスト）→ すぐ送らず“ためる”だけ
  if (body) { appendToBuffer(body); }
  return ContentService.createTextOutput("ok");
}

/* 「進捗」コマンドへの返信文（保存済みスナップショット） */
function progressText(){
  var snap = PROPS.getProperty("SNAPSHOT");
  if (!snap) return "📊 まだ達成状況の記録がありません。\n本人がトップページを開くと記録されます。";
  try { var o = JSON.parse(snap); return o.text || "📊 記録を読み取れませんでした。"; }
  catch (e) { return "📊 記録を読み取れませんでした。"; }
}

/* 動きが無かったときのリマインド文 */
function reminderText(){
  var add = "";
  var snap = PROPS.getProperty("SNAPSHOT");
  if (snap) { try { var o = JSON.parse(snap); if (o.overall != null) add = "\n今の達成率：" + o.overall + "%（合格は80%以上）"; } catch (e) {} }
  return "📣 前回の報告から学習の記録がありません。\n莉映くん、もう1単元いこう💪" + add + "\n#莉映の期末対策";
}

/* 受け取った結果を1行に要約してバッファに追記 */
function appendToBuffer(text){
  var first = text.split("\n")[0];                 // 例: 📘 地理：日本の地形・気候
  var m = text.match(/（(\d+)%）/);                 // 正答率
  var pct = m ? m[1] : "?";
  var pass = text.indexOf("🎉") >= 0;              // 合格(80%)なら🎉が入っている
  var line = first + "  " + pct + "%" + (pass ? " ✅" : " 💪");

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var buf = PROPS.getProperty("BUFFER") || "";
    buf += (buf ? "\n" : "") + line;
    PROPS.setProperty("BUFFER", buf);
  } catch (e2) {
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
}

/* 1日3回（18/20/23時）：たまっている分をまとめて1通だけ送る（トリガーで自動実行） */
function sendDailyDigest(){
  var gid = PROPS.getProperty("GROUP_ID");
  if (!gid) { return; }
  var buf = PROPS.getProperty("BUFFER") || "";
  if (!buf) { push(gid, reminderText()); return; }  // 前回以降に動きが無い → リマインドを送る

  var lines = buf.split("\n");
  var passCount = lines.filter(function(l){ return l.indexOf("✅") >= 0; }).length;
  var header = "📚 学習まとめ（" + lines.length + "単元 ・ 合格" + passCount + "）";
  var msg = header + "\n――――――――――\n" + buf +
            "\n――――――――――\nこの調子でいこう！ #莉映の期末対策";

  push(gid, msg);
  PROPS.deleteProperty("BUFFER");                  // 送ったら今日分はリセット
}

/* 1日3回（18時・20時・23時）のまとめ送信を予約（一度だけ実行する） */
function setupDailyTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === "sendDailyDigest") ScriptApp.deleteTrigger(t);
  });
  [18, 20, 23].forEach(function(h){
    ScriptApp.newTrigger("sendDailyDigest").timeBased().everyDays(1).atHour(h).create();
  });
}

/* ---- LINE送信ヘルパー ---- */
function push(to, text){
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: { "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN },
    contentType: "application/json",
    payload: JSON.stringify({ to: to, messages: [{ type: "text", text: text }] }),
    muteHttpExceptions: true
  });
}
function reply(token, text){
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    headers: { "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN },
    contentType: "application/json",
    payload: JSON.stringify({ replyToken: token, messages: [{ type: "text", text: text }] }),
    muteHttpExceptions: true
  });
}

/* ---- 動作確認用 ---- */
function testPush(){            // 接続テスト：今すぐ1通送る
  var gid = PROPS.getProperty("GROUP_ID");
  if (gid) push(gid, "🔔 テスト送信：自動まとめ投稿の準備ができました！");
}
function testDigestNow(){       // 今ためている分を、待たずに今すぐまとめ送信
  sendDailyDigest();
}
