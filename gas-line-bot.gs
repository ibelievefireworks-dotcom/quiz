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
  var json = null;
  try { json = JSON.parse(body); } catch (err) {}

  // ① LINEのWebhook → グループIDを自動登録し、確認を返信
  if (json && json.events) {
    json.events.forEach(function(ev){
      var gid = ev.source && ev.source.groupId;
      if (gid && PROPS.getProperty("GROUP_ID") !== gid) {   // ★初回（未登録）のときだけ登録＆返信
        PROPS.setProperty("GROUP_ID", gid);
        if (ev.replyToken) {
          reply(ev.replyToken, "✅ このグループを登録しました。1日3回（18時・20時・23時）に学習まとめが届きます！");
        }
      }
    });
    return ContentService.createTextOutput("ok");
  }

  // ② クイズの結果（プレーンテキスト）→ すぐ送らず“ためる”だけ
  if (body) { appendToBuffer(body); }
  return ContentService.createTextOutput("ok");
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
  var buf = PROPS.getProperty("BUFFER") || "";
  if (!gid || !buf) { return; }                    // 新しい分が無ければ送らない＝無料枠を節約

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
