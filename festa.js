/* 페스타 전용: 운영자 로그인(행사 기기만 업로드·랭킹 기록 권한) + 선택 사진 20분 QR 수령 */
(function () {
    const W = "https://pose-photo-pickup-test.indosupervisor0126.workers.dev";
    const KEY = "FESTA_OP_TOKEN";
    const MAX_BYTES = 3800000;
    const token = () => { try { const t = sessionStorage.getItem(KEY) || ""; return Number(t.split(".")[0]) > Date.now() / 1000 ? t : ""; } catch (e) { return ""; } };
    window.FestaOp = { token, worker: W };

    function $(id) { return document.getElementById(id); }
    function refreshOpUI() {
        const on = !!token();
        if ($("op-state")) $("op-state").textContent = on ? "운영자 로그인됨 (이 기기만, 최대 6시간)" : "로그인 전: 점수 기록과 QR 사진 전송은 꺼져 있어요";
        if ($("op-logout")) $("op-logout").style.display = on ? "inline-block" : "none";
        if ($("op-login")) $("op-login").style.display = on ? "none" : "inline-block";
        if ($("op-pin")) $("op-pin").style.display = on ? "none" : "inline-block";
        const q = $("shots-qr-btn"); if (q) { q.disabled = !on; q.style.opacity = on ? 1 : .5; }
        const n = $("shots-qr-note"); if (n) n.textContent = on ? "" : "QR 수령은 행사 진행자가 이 기기에서 로그인한 뒤에만 쓸 수 있어요. 지금은 '선택한 사진 저장'만 가능해요.";
    }
    async function login() {
        const pin = $("op-pin").value; $("op-pin").value = "";
        $("op-msg").textContent = "확인 중...";
        try {
            const r = await fetch(W + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
            if (r.status === 429) { $("op-msg").textContent = "요청이 많아요. 잠시 후 다시 시도해 주세요."; return; }
            if (!r.ok) { $("op-msg").textContent = "비밀번호가 맞지 않아요."; return; }
            sessionStorage.setItem(KEY, (await r.json()).token);
            $("op-msg").textContent = "";
            window.dispatchEvent(new CustomEvent("festa-op-login"));
        } catch (e) { $("op-msg").textContent = "연결하지 못했어요. 인터넷을 확인해 주세요."; }
        refreshOpUI();
    }
    function logout() { try { sessionStorage.removeItem(KEY); } catch (e) {} refreshOpUI(); }
    const blobToDataUrl = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });

    let qrLoaded = null;
    function loadQr() { return qrLoaded || (qrLoaded = new Promise((res, rej) => { const s = document.createElement("script"); s.src = W + "/qr.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); })); }

    async function sendQr() {
        const msg = $("shots-msg"), area = $("shots-qr-area");
        const picked = window.getPickedShots ? window.getPickedShots() : [];
        if (!token()) { msg.textContent = "운영자 로그인 후 사용할 수 있어요."; return; }
        if (!picked.length) { msg.textContent = "받을 사진을 먼저 선택해 주세요."; return; }
        if (!$("shots-consent").checked) { msg.textContent = "임시 저장 안내를 확인하고 체크해 주세요."; return; }
        msg.textContent = "사진을 보내는 중...";
        try {
            const urls = [];
            for (const x of picked) urls.push(await blobToDataUrl(await (await fetch(x.url)).blob()));
            if (urls.some(u => !u.startsWith("data:image/jpeg;base64,"))) throw new Error("format");
            const body = '{"photos":["' + urls.join('","') + '"]}';
            if (body.length > MAX_BYTES) { msg.textContent = "사진이 너무 커요. 장수를 줄여 다시 선택해 주세요."; return; }
            const r = await fetch(W + "/api/save", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() }, body });
            if (r.status === 401) { logout(); msg.textContent = "로그인이 만료됐어요. 운영자 로그인을 다시 해 주세요."; return; }
            if (!r.ok) { msg.textContent = "서버에 임시 저장하지 못했어요. 대신 '선택한 사진 저장'으로 이 기기에 저장해 주세요."; return; }
            const j = await r.json();
            await loadQr();
            const q = qrcode(0, "M"); q.addData(j.url); q.make();
            area.innerHTML = '<div style="background:#fff;padding:8px;border-radius:10px;display:inline-block">' + q.createSvgTag(5) + '</div>';
            const p = document.createElement("p"); p.style.cssText = "font-size:.8rem;margin:6px 0 0;word-break:break-all"; p.textContent = "휴대폰 카메라로 QR을 찍으세요. " + (j.minutes || 20) + "분 동안만 받을 수 있어요."; area.appendChild(p);
            msg.textContent = picked.length + "장을 서버에 임시 저장했어요. 휴대폰에서 다운로드 페이지가 열리는지, 갤러리에 저장됐는지는 직접 확인해 주세요.";
        } catch (e) { msg.textContent = "보내지 못했어요. 대신 '선택한 사진 저장'으로 이 기기에 저장해 주세요."; }
    }
    function mount() {
        const box = $("shots-gallery-box");
        if (box && !$("shots-qr-btn")) {
            const dl = $("shots-download-btn");
            const wrap = document.createElement("div");
            wrap.innerHTML = '<label style="display:block;margin-top:10px;font-size:.8rem;line-height:1.4"><input type="checkbox" id="shots-consent"> QR로 받으면 고른 사진이 서버에 20분 동안 임시 저장되는 것을 확인했어요. 20분이 지나면 이 주소로 받을 수 없게 되고 서버에서도 지워지도록 설정돼 있지만, 실제로 지워지는 시각은 보장하지 않아요. 얼굴이 나온 사진이니 원할 때만 눌러 주세요.</label>' +
                '<button id="shots-qr-btn" type="button" style="width:100%;margin-top:8px;padding:10px;border:0;border-radius:10px;background:#7c3aed;color:#fff;font-weight:700">선택한 사진 QR로 받기 (20분)</button>' +
                '<p id="shots-qr-note" style="margin:4px 0 0;font-size:.8rem;color:#92400e"></p><div id="shots-qr-area" style="text-align:center;margin-top:8px"></div>';
            dl.insertAdjacentElement("afterend", wrap);
            $("shots-qr-btn").onclick = sendQr;
            refreshOpUI();
        }
        if ($("op-login") && !$("op-login").dataset.b) { $("op-login").dataset.b = 1; $("op-login").onclick = login; $("op-logout").onclick = logout; $("op-pin").addEventListener("keydown", e => { if (e.key === "Enter") login(); }); refreshOpUI(); }
    }
    new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", mount);
    window.addEventListener("festa-op-login", refreshOpUI);
})();
