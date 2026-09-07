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
      var txt0 = (ev.type === "message" && ev.message && ev.message.type === "text") ? (ev.message.text || "") : "";
      // 投稿先の登録は明示コマンドだけ（他のグループの発言で勝手に切り替わらない）
      //   「勉強登録」→ 学習まとめ・「進捗」の投稿先（りえい 明光義塾）
      //   「野球登録」→ 自主トレ達成率（20:00/21:30）の投稿先（りえい 黒羽根コーチ）
      if (gid && ev.replyToken && txt0.indexOf("勉強登録") >= 0) {
        PROPS.setProperty("GROUP_STUDY", gid);
        reply(ev.replyToken, "✅ このグループを【勉強】の投稿先に登録しました。学習まとめ（18時・20時・23時）が届きます！");
        return;
      }
      if (gid && ev.replyToken && txt0.indexOf("野球登録") >= 0) {
        PROPS.setProperty("GROUP_TRAIN", gid);
        reply(ev.replyToken, "✅ このグループを【野球】の投稿先に登録しました。自主トレの達成率（20:00・21:30）が届きます！");
        return;
      }
      // 「進捗」「状況」と送られたら、現在の達成状況を返信
      if (ev.type === "message" && ev.message && ev.message.type === "text" && ev.replyToken) {
        var t = ev.message.text || "";
        if (t.indexOf("トレ") >= 0 || t.indexOf("メニュー") >= 0) {
          reply(ev.replyToken, trainingStatusText());        // 自主トレの今の状況
        } else if (t.indexOf("進捗") >= 0 || t.indexOf("状況") >= 0 || t.indexOf("しんちょく") >= 0) {
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

/* 投稿先グループ（勉強＝GROUP_STUDY／野球＝GROUP_TRAIN。旧GROUP_IDは野球側の予備） */
function studyGroup(){ return PROPS.getProperty("GROUP_STUDY") || ""; }
function trainGroup(){ return PROPS.getProperty("GROUP_TRAIN") || PROPS.getProperty("GROUP_ID") || ""; }

/* 1日3回（18/20/23時）：たまっている分をまとめて1通だけ送る（トリガーで自動実行） */
function sendDailyDigest(){
  var gid = studyGroup();
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

/* =====================================================================
   自主トレ管理アプリ（nnn.lomo.jp/kanri）の「今日の達成率」リマインド
   ---------------------------------------------------------------------
   ・20:00  「今日は100%を達成できるか！？」＋現時点の達成数
   ・21:30  その時点の達成率＋未達成項目の列記
   ・グループで「トレ」と送ると、その時点の状況をすぐ返信
   設定：関数 setupTrainingTriggers を一度だけ実行（毎日0時台に当日20:00/21:30の
         1回限りトリガーを予約する仕組み。分単位で正確に届く）
   ===================================================================== */

var KANRI_API = "https://nnn.lomo.jp/kanri/api/";
var KANRI_URL = "https://nnn.lomo.jp/kanri/";

function todayIsoJst(){ return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd"); }

/* アプリから今日のメニューと記録を取得して集計 */
function fetchKanriToday(){
  var date = todayIsoJst();
  var menuRes = JSON.parse(UrlFetchApp.fetch(KANRI_API + "get_menu.php", {muteHttpExceptions:true}).getContentText());
  var logRes  = JSON.parse(UrlFetchApp.fetch(KANRI_API + "get_log.php?date=" + date, {muteHttpExceptions:true}).getContentText());
  var dayKey = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date(date + "T00:00:00+09:00").getDay()];
  var log = logRes && logRes.log;
  var items, completed = {}, hidden = [];
  if (log) {
    hidden = log.hidden || [];
    items = (Array.isArray(log.baseMenu) ? log.baseMenu : (menuRes.menu||{})[dayKey] || []).concat(log.extraMenu || []);
    completed = (log.completed && !Array.isArray(log.completed)) ? log.completed : {};
  } else {
    items = (menuRes.menu||{})[dayKey] || [];
  }
  items = items.filter(function(i){ return hidden.indexOf(i) < 0; });
  var done = items.filter(function(i){ return completed[i]; });
  var undone = items.filter(function(i){ return !completed[i]; });
  var rate = items.length ? Math.round(done.length / items.length * 100) : 0;
  return { date:date, logged:!!log, total:items.length, done:done.length, rate:rate, undone:undone };
}

/* 20:00 「今日は100%を達成できるか！？」 */
function trainingPreviewText(){
  var s = fetchKanriToday();
  if (!s.total) return "";
  if (s.rate === 100) return "🎉 20時の時点でもう100%達成！\n本牧の中で一番練習した日だ。\n#莉映の自主トレ";
  return "🔥 20時チェック\n今日は100%を達成できるか！？\n\n" +
         "📋 今日のメニュー：" + s.total + "項目\n" +
         "✅ いま：" + s.done + "/" + s.total + "（" + s.rate + "%）" + (s.logged ? "" : "（まだ記録なし）") + "\n\n" +
         "残り" + s.undone.length + "項目、まだ間に合う！\n👉 " + KANRI_URL + "\n#莉映の自主トレ";
}

/* 21:30 達成率＋未達成の列記（「トレ」コマンドの返信にも使う） */
function trainingStatusText(){
  var s = fetchKanriToday();
  if (!s.total) return "📋 今日のメニューが見つかりません。\n" + KANRI_URL;
  var now = Utilities.formatDate(new Date(), "Asia/Tokyo", "H:mm");
  if (s.rate === 100) return "🎉 " + now + " 現在：100%達成（" + s.done + "/" + s.total + "）\n本牧の中で一番練習した！\n#莉映の自主トレ";
  var head = "⏰ " + now + " 現在\n達成率 " + s.rate + "%（" + s.done + "/" + s.total + "）" + (s.logged ? "" : "\n📝 今日はまだ記録がありません") + "\n\n";
  var list = "❌ 未達成 " + s.undone.length + "項目\n" + s.undone.map(function(i){ return "・" + i; }).join("\n");
  return head + list + "\n\n寝るまでに、やった分は必ず記録！\n👉 " + KANRI_URL + "\n#莉映の自主トレ";
}

function sendTrainingPreview(){                 // 20:00 トリガー
  deleteTriggersOf("sendTrainingPreview");
  var gid = trainGroup(); if (!gid) return;
  var t = trainingPreviewText(); if (t) push(gid, t);
}
function sendTrainingStatus(){                  // 21:30 トリガー
  deleteTriggersOf("sendTrainingStatus");
  var gid = trainGroup(); if (!gid) return;
  push(gid, trainingStatusText());
}

/* 毎日0時台に実行：当日20:00と21:30の1回限りトリガーを予約 */
function scheduleTodayTrainingTriggers(){
  deleteTriggersOf("sendTrainingPreview");
  deleteTriggersOf("sendTrainingStatus");
  var d = todayIsoJst();
  var t1 = new Date(d + "T20:00:00+09:00"), t2 = new Date(d + "T21:30:00+09:00"), now = new Date();
  if (t1 > now) ScriptApp.newTrigger("sendTrainingPreview").timeBased().at(t1).create();
  if (t2 > now) ScriptApp.newTrigger("sendTrainingStatus").timeBased().at(t2).create();
}
function deleteTriggersOf(fn){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
}

/* 一度だけ実行：毎日0時台の予約トリガーを作成し、今日の分もすぐ予約する */
function setupTrainingTriggers(){
  deleteTriggersOf("scheduleTodayTrainingTriggers");
  ScriptApp.newTrigger("scheduleTodayTrainingTriggers").timeBased().everyDays(1).atHour(0).create();
  scheduleTodayTrainingTriggers();
}

/* 動作確認：今の状況を今すぐ1通送る */
function testTrainingStatusNow(){
  var gid = trainGroup();
  if (gid) push(gid, trainingStatusText());
}

/* ---- 動作確認用 ---- */
function testPush(){            // 接続テスト：勉強グループへ今すぐ1通送る
  var gid = studyGroup();
  if (gid) push(gid, "🔔 テスト送信：自動まとめ投稿の準備ができました！");
}
function testDigestNow(){       // 今ためている分を、待たずに今すぐまとめ送信
  sendDailyDigest();
}
