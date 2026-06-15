/* =========================================================
   各単元の結果を「家族LINEグループ」へ自動共有するための送信先。
   Google Apps Script を公開して得た /exec の URL を REPORT_URL に
   貼ると、自動投稿が有効になります。
   空のままなら自動投稿はオフ（手動の「LINEで送る」は引き続き使えます）。
   設定手順は LINE設定ガイド.md を参照。
   ========================================================= */
window.REPORT_URL = "";   // 例: "https://script.google.com/macros/s/XXXX/exec"

window.reportUnit = function(text){
  if(!window.REPORT_URL) return;              // 未設定なら何もしない（既存機能は無傷）
  try{
    fetch(window.REPORT_URL, {
      method: "POST",
      mode: "no-cors",                        // GASへ投げっぱなし（応答は読まない）
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: text
    });
  }catch(e){ /* 失敗しても学習はそのまま続行 */ }
};
