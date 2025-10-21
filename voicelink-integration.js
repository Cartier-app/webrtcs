/* WhatsApp-style Voice Call Integration for any chat app. */
(function(window) {
  const SUPABASE_URL = null;
  const SUPABASE_KEY = null;
  let supabase, currentUser, friendUser, roomId, callActive = false, mediaRecorder, recordedChunks = [], callStartTime, callTimerInterval, localStream, peerConnection, callStatus, notificationPermission;
  let callStatusChannel, userStatusChannel;
  let callId;
  const COLORS = {
    background: "#111B21",
    bubble: "#202C33",
    text: "#E9EDEF",
    accent: "#25D366",
    accentDark: "#20BD5C",
    border: "#2A3942",
    shadow: "rgba(0,0,0,0.3)"
  };

  // ---- Utility ----
  function $(sel, ctx=document) { return ctx.querySelector(sel); }
  function createEl(tag, props={}, children=[]) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    Object.assign(el.style, props.style||{});
    children.forEach(c => el.appendChild(c));
    return el;
  }
  function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
  function vibrate(ms=200) { if (navigator.vibrate) navigator.vibrate(ms); }
  function notify(text) {
    if (notificationPermission === "granted") {
      new Notification(text);
    }
  }
  function formatTime(ms) {
    const s = Math.floor(ms/1000), m=Math.floor(s/60), sec=s%60;
    return `${m}:${sec<10?"0":""}${sec}`;
  }
  function getAvatar(username) {
    // Placeholder: use identicon or fetch from chat app user data if available
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;
  }
  // ---- Supabase Setup ----
  function setupSupabase(url, key) {
    supabase = window.supabase.createClient(url, key);
  }
  async function getOrCreateRoom(a, b) {
    const ids = [a,b].sort();
    const roomKey = ids.join("-");
    roomId = roomKey;
    // Find existing
    const { data } = await supabase.from("rooms").select("*")
      .eq("room_key", roomKey).single();
    if (data) return data.id;
    // Create new
    const { data: created } = await supabase.from("rooms").insert({
      room_key: roomKey
    }).select().single();
    return created.id;
  }
  async function logCall(status, start=null, end=null, duration=null) {
    await supabase.from("calls").insert({
      caller_username: currentUser,
      receiver_username: friendUser,
      call_status: status,
      start_time: start,
      end_time: end,
      duration: duration,
      room_key: roomId
    });
  }
  async function updateCallStatus(status) {
    await supabase.from("calls").update({
      call_status: status
    }).eq("caller_username", currentUser).eq("receiver_username", friendUser).eq("room_key", roomId);
  }
  // ---- UI Components ----
  function createCallButton() {
    const btn = createEl("button", {
      id: "voice-call",
      innerHTML: "📞",
      style: {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: COLORS.accent,
        color: COLORS.text,
        border: "none",
        borderRadius: "50%",
        padding: "12px 14px",
        fontSize: "28px",
        boxShadow: `0 3px 10px ${COLORS.shadow}`,
        zIndex: 9999,
        transition: "box-shadow .2s, scale .2s"
      }
    });
    btn.onmouseenter = () => btn.style.background = COLORS.accentDark;
    btn.onmouseleave = () => btn.style.background = COLORS.accent;
    // Pulse effect when active
    setInterval(()=>{ if (callStatus==="calling") btn.style.boxShadow = `0 0 20px ${COLORS.accent}`; else btn.style.boxShadow = `0 3px 10px ${COLORS.shadow}`; }, 800);
    btn.onclick = startCall;
    document.body.appendChild(btn);
  }
  function showOverlay(type, avatar, text, controls=[]) {
    // Remove existing
    let ov = $("#voicelink-overlay");
    if (ov) ov.remove();
    ov = createEl("div", {
      id: "voicelink-overlay",
      style: {
        position: "fixed",
        top:0, left:0, width:"100vw", height:"100vh",
        background:"rgba(0,0,0,0.6)",
        zIndex:10000,
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center"
      }
    });
    ov.appendChild(createEl("img", {
      src: avatar,
      style: {
        width:"96px", height:"96px",
        borderRadius:"50%", boxShadow:`0 0 12px ${COLORS.shadow}`,
        marginBottom:"22px", background:COLORS.bubble
      }
    }));
    ov.appendChild(createEl("div", {
      innerHTML: `<span style="color:${COLORS.text};font-size:20px;font-weight:600">${text}</span>`,
      style: {marginBottom:"28px"}
    }));
    controls.forEach(c => ov.appendChild(c));
    document.body.appendChild(ov);
  }
  function showIncomingCallPopup(fromUser, avatar) {
    vibrate(250);
    showOverlay("incoming", avatar, "Incoming Call", [
      createEl("div", {style:{display:"flex",gap:"18px",justifyContent:"center"}},
        [
          createEl("button", {
            innerHTML:"<span style='font-size:22px'>✅</span> Accept",
            style:{background:COLORS.accent,color:"white",border:"none",borderRadius:"28px",padding:"14px 24px",fontWeight:"bold",fontSize:"18px",boxShadow:`0 2px 8px ${COLORS.shadow}`},
            onclick: ()=>acceptCall()
          }),
          createEl("button", {
            innerHTML:"<span style='font-size:22px'>❌</span> Decline",
            style:{background:"#E0245E",color:"white",border:"none",borderRadius:"28px",padding:"14px 24px",fontWeight:"bold",fontSize:"18px",boxShadow:`0 2px 8px ${COLORS.shadow}`},
            onclick: ()=>declineCall()
          })
        ]
      )
    ]);
  }
  function showCallingPopup() {
    showOverlay("calling", getAvatar(friendUser), "Calling...");
  }
  function showRingingPopup() {
    showOverlay("ringing", getAvatar(friendUser), "Ringing...");
  }
  function showActiveCallUI() {
    // Remove overlays
    let ov = $("#voicelink-overlay"); if (ov) ov.remove();
    // Bottom bar UI
    let bar = $("#voicelink-callbar");
    if (bar) bar.remove();
    bar = createEl("div", {
      id:"voicelink-callbar",
      style:{
        position:"fixed", bottom:"0", left:"0", width:"100vw", height:"80px",
        background:COLORS.bubble, display:"flex", alignItems:"center", justifyContent:"space-evenly",
        boxShadow:`0 -2px 18px ${COLORS.shadow}`, borderTop:`2px solid ${COLORS.accent}`,
        zIndex:10001
      }
    });
    // Mute
    let muteBtn = createEl("button", {
      innerHTML:"🔇",
      style:{background:"none",border:"none",color:COLORS.text,fontSize:"32px"},
      onclick:()=>toggleMute()
    });
    // Speaker
    let speakerBtn = createEl("button", {
      innerHTML:"🔉",
      style:{background:"none",border:"none",color:COLORS.text,fontSize:"32px"},
      onclick:()=>toggleSpeaker()
    });
    // End call
    let endBtn = createEl("button", {
      innerHTML:"<span style='font-size:30px'>❌</span>",
      style:{background:"#E0245E",color:"white",border:"none",borderRadius:"50%",padding:"12px 16px",fontWeight:"bold",fontSize:"20px"},
      onclick:()=>endCall()
    });
    // Timer
    let timer = createEl("span", {
      id:"voicelink-calltimer",
      innerText:"0:00",
      style:{marginLeft:"24px",color:COLORS.accent,fontSize:"18px"}
    });
    bar.appendChild(muteBtn); bar.appendChild(speakerBtn); bar.appendChild(endBtn); bar.appendChild(timer);
    document.body.appendChild(bar);
    // Start timer
    callStartTime = Date.now();
    callTimerInterval = setInterval(()=>{
      $("#voicelink-calltimer").innerText = formatTime(Date.now()-callStartTime);
    },1000);
  }
  // ---- Call Logic ----
  async function startCall() {
    // Check user status
    const { data: friendStatus } = await supabase.from("users").select("status").eq("username", friendUser).single();
    if (!friendStatus || friendStatus.status !== "online") {
      notify("User is offline");
      showOverlay("info", getAvatar(friendUser), "User is offline");
      await logCall("missed");
      setTimeout(()=>$("#voicelink-overlay")?.remove(),1800);
      return;
    }
    // Check busy
    if (friendStatus.status === "busy") {
      notify("User is busy");
      showOverlay("info", getAvatar(friendUser), "User is busy");
      await logCall("busy");
      setTimeout(()=>$("#voicelink-overlay")?.remove(),1800);
      return;
    }
    // Create/find room
    const roomId = await getOrCreateRoom(currentUser, friendUser);
    // Set call status
    await supabase.from("users").update({status:"calling"}).eq("username", currentUser);
    callStatus = "calling";
    showCallingPopup();
    // Send call event to callee
    await supabase.from("calls").insert({
      caller_username: currentUser,
      receiver_username: friendUser,
      call_status: "calling",
      start_time: new Date().toISOString(),
      room_key: roomId
    });
    subscribeToCallStatus(roomId);
    subscribeToUserStatus(friendUser);
  }
  async function acceptCall() {
    callStatus = "accepted";
    await supabase.from("calls")
      .update({call_status:"accepted"})
      .eq("caller_username", friendUser)
      .eq("receiver_username", currentUser)
      .eq("room_key", roomId);
    showActiveCallUI();
    await startWebRTC(true);
  }
  async function declineCall() {
    callStatus = "declined";
    await supabase.from("calls")
      .update({call_status:"declined"})
      .eq("caller_username", friendUser)
      .eq("receiver_username", currentUser)
      .eq("room_key", roomId);
    notify("Call declined");
    showOverlay("info", getAvatar(friendUser), "Call declined");
    setTimeout(()=>$("#voicelink-overlay")?.remove(),1800);
    await logCall("declined");
  }
  async function endCall() {
    callStatus = "ended";
    await supabase.from("users").update({status:"online"}).eq("username", currentUser);
    await updateCallStatus("ended");
    showOverlay("info", getAvatar(friendUser), "Call ended");
    clearInterval(callTimerInterval);
    setTimeout(()=>$("#voicelink-overlay")?.remove(),1600);
    await logCall("ended", callStartTime, new Date().toISOString(), Date.now()-callStartTime);
    if (mediaRecorder && recordedChunks.length) {
      const blob = new Blob(recordedChunks, {type:'audio/webm'});
      await supabase.storage.from('call_recordings').upload(`call_${roomId}_${Date.now()}.webm`, blob, {cacheControl:'3600', upsert:true});
    }
    if (peerConnection) peerConnection.close();
    let bar = $("#voicelink-callbar"); if (bar) bar.remove();
    callActive = false;
    recordedChunks = [];
  }
  function toggleMute() {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
    }
  }
  function toggleSpeaker() {
    // Mobile: switch output (not supported on all browsers)
    if (window.AudioContext) {
      let ctx = new AudioContext();
      // Not supported everywhere, demo only
    }
  }
  // ---- WebRTC Setup ----
  async function startWebRTC(isCallee) {
    peerConnection = new RTCPeerConnection({
      iceServers: [{urls:"stun:stun.l.google.com:19302"}]
    });
    peerConnection.onicecandidate = async e => {
      if (e.candidate) await sendSignaling("ice", e.candidate);
    };
    peerConnection.ontrack = e => {
      // Play remote audio
      let remoteAudio = $("#voicelink-remoteaudio");
      if (!remoteAudio) {
        remoteAudio = createEl("audio", {id:"voicelink-remoteaudio",autoplay:true});
        document.body.appendChild(remoteAudio);
      }
      remoteAudio.srcObject = e.streams[0];
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "disconnected") {
        endCall();
        notify("Disconnected. Trying to reconnect...");
        setTimeout(()=>startWebRTC(isCallee),2000);
      }
    };
    // Noise suppression/Echo cancel/WebRTC config
    const constraints = { audio: {echoCancellation:true,noiseSuppression:true} };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream.getAudioTracks().forEach(t=>peerConnection.addTrack(t, localStream));
    // Call recording (hidden)
    mediaRecorder = new MediaRecorder(localStream);
    mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
    mediaRecorder.start();
    callActive = true;
    if (!isCallee) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await sendSignaling("offer", offer);
    } else {
      // Wait for offer
      const { data } = await supabase.from("signaling")
        .select("*").eq("room_id", roomId).eq("type","offer").order("created_at",{ascending:false}).limit(1).single();
      if (data && data.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignaling("answer", answer);
      }
    }
    // Listen for signaling
    subscribeToSignaling(roomId);
  }
  async function sendSignaling(type, data) {
    await supabase.from("signaling").insert({
      room_id: roomId,
      type,
      sdp: type==="offer"||type==="answer"?data:null,
      ice: type==="ice"?JSON.stringify(data):null
    });
  }
  function subscribeToSignaling(roomId) {
    supabase.channel(`signaling-${roomId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"signaling"},payload=>{
        const {type,sdp,ice} = payload.new;
        if (type==="answer" && peerConnection) peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        if (type==="ice" && peerConnection) peerConnection.addIceCandidate(JSON.parse(ice));
      }).subscribe();
  }
  function subscribeToCallStatus(roomId) {
    callStatusChannel = supabase.channel(`calls-${roomId}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"calls"},payload=>{
        callStatus = payload.new.call_status;
        if (callStatus==="ringing") showRingingPopup();
        if (callStatus==="accepted") showActiveCallUI();
        if (callStatus==="declined") declineCall();
        if (callStatus==="ended") endCall();
      }).subscribe();
  }
  function subscribeToUserStatus(username) {
    userStatusChannel = supabase.channel(`user-status-${username}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"users"},payload=>{
        if (payload.new.status === "offline" || payload.new.status === "busy") {
          notify("User is unavailable");
          showOverlay("info", getAvatar(friendUser), "User is unavailable");
          setTimeout(()=>$("#voicelink-overlay")?.remove(),1800);
        }
      }).subscribe();
  }
  // ---- Missed Call Replay ----
  async function showMissedCalls() {
    const { data } = await supabase.from("calls")
      .select("*").eq("receiver_username", currentUser)
      .eq("call_status", "missed").order("created_at",{ascending:false}).limit(5);
    if (data && data.length) {
      data.forEach(c => {
        // Show notification with "Replay" option
        notify(`Missed call from ${c.caller_username}`);
      });
    }
  }
  // ---- Init ----
  async function init(params) {
    if (!window.supabase) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js";
      s.onload = ()=>init(params);
      document.head.appendChild(s);
      return;
    }
    notificationPermission = Notification.permission;
    if (Notification && notificationPermission !== "granted") {
      Notification.requestPermission().then(p=>notificationPermission=p);
    }
    setupSupabase(params.supabaseUrl, params.supabaseKey);
    currentUser = params.currentUser;
    friendUser = params.friendUser;
    createCallButton();
    showMissedCalls();
  }

  window.VoiceLink = { init };
})(window);