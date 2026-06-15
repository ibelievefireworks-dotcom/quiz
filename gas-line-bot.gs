/* =====================================================================
   莉映の期末対策クイズ → 家族LINEグループ 自動投稿（Google Apps Script）
   ---------------------------------------------------------------------
   使い方は「LINE設定ガイド.md」を参照。
   CHANNEL_ACCESS_TOKEN に、LINE Messaging API の
   「チャネルアクセストークン（長期）」を貼り付けてください。
   グループIDは、Botをグループに招待してメッセージを送ると自動登録されます。
   ===================================================================== */

var CHANNEL_ACCESS_TOKEN = "ここに_チャネルアクセストークン_を貼る";

var PROPS = PropertiesService.getScriptProperties();

function doPost(e){
  var body = (e && e.postData) ? e.postData.contents : "";
  var json = null;
  try { json = JSON.parse(body); } catch (err) {}

  // ① LINEからのWebhook → グループIDを自動登録し、確認を返信
  if (json && json.events) {
    json.events.forEach(function(ev){
      var gid = ev.source && ev.source.groupId;
      if (gid) {
        PROPS.setProperty("GROUP_ID", gid);
        if (ev.replyToken) {
          reply(ev.replyToken, "✅ このグループを登録しました。これから莉映くんのクイズ結果が自動で届きます！");
        }
      }
    });
    return ContentService.createTextOutput("ok");
  }

  // ② クイズページからの結果（プレーンテキスト）→ 登録済みグループへ送信
  var gid = PROPS.getProperty("GROUP_ID");
  if (gid && body) { push(gid, body); }
  return ContentService.createTextOutput("ok");
}

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

/* 動作確認用：実行するとテストメッセージをグループへ送ります */
function testPush(){
  var gid = PROPS.getProperty("GROUP_ID");
  if (gid) push(gid, "🔔 テスト送信：自動投稿の準備ができました！");
}
