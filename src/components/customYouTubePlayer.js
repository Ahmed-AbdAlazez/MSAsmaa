/**
 * customYouTubePlayer.js
 * ---------------------------------------------------------------------------
 * Custom Platform-Branded Video Player Component for YouTube videos.
 *
 * Uses the official YouTube IFrame Player API (controls=0, rel=0, playsinline=1, fs=0)
 * and wraps it in our own native "منصة المرسال" platform control bar.
 */

let isYtApiLoading = false;
const ytApiReadyPromises = [];

/** Ensures the YouTube IFrame API script is loaded. */
function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  return new Promise((resolve) => {
    ytApiReadyPromises.push(resolve);

    if (!isYtApiLoading) {
      isYtApiLoading = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === "function") previousCallback();
        ytApiReadyPromises.forEach((cb) => cb(window.YT));
        ytApiReadyPromises.length = 0;
      };
    }
  });
}

/** Formats seconds into mm:ss format. */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Renders the custom platform YouTube player inside a container.
 *
 * @param {HTMLElement} container - The DOM container element (e.g. #playerBox)
 * @param {Object} videoEntry - Video data object containing youtubeVideoId
 */
export async function renderCustomYouTubePlayer(container, videoEntry) {
  if (!container || !videoEntry || !videoEntry.youtubeVideoId) return;

  // Clear existing content
  container.innerHTML = "";
  container.className = "custom-yt-container";

  // Build DOM layout
  const ytTargetId = `yt-target-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  container.innerHTML = `
    <div class="custom-yt-video-wrap">
      <div id="${ytTargetId}" class="custom-yt-iframe"></div>
      <div class="custom-yt-click-shield" id="yt-click-shield"></div>
    </div>

    <div class="custom-yt-watermark">🧬 منصة المرسال</div>

    <div class="custom-yt-center-overlay" id="yt-center-overlay">
      <div class="custom-yt-loading-spinner" id="yt-spinner"></div>
      <button class="custom-yt-big-play-btn" id="yt-big-play-btn" style="display:none;" aria-label="تشغيل">▶</button>
    </div>

    <div class="custom-yt-controls-bar" id="yt-controls-bar">
      <div class="custom-yt-progress-container" id="yt-progress-container">
        <div class="custom-yt-progress-track">
          <div class="custom-yt-progress-fill" id="yt-progress-fill"></div>
        </div>
      </div>

      <div class="custom-yt-buttons-row">
        <div class="custom-yt-controls-group">
          <button class="custom-yt-btn" id="yt-play-pause-btn" title="تشغيل / إيقاف">▶</button>
          <div class="custom-yt-volume-wrap">
            <button class="custom-yt-btn" id="yt-mute-btn" title="كتم الصوت">🔊</button>
            <input type="range" class="custom-yt-volume-slider" id="yt-volume-slider" min="0" max="100" value="100">
          </div>
          <span class="custom-yt-time">
            <span id="yt-time-current">0:00</span> / <span id="yt-time-duration">0:00</span>
          </span>
        </div>

        <div class="custom-yt-controls-group">
          <select class="custom-yt-speed-select" id="yt-speed-select" title="سرعة التشغيل">
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1" selected>1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
          <button class="custom-yt-btn" id="yt-fullscreen-btn" title="شاشة كاملة">⛶</button>
        </div>
      </div>
    </div>
  `;

  // Query Control Elements
  const shield = container.querySelector("#yt-click-shield");
  const spinner = container.querySelector("#yt-spinner");
  const bigPlayBtn = container.querySelector("#yt-big-play-btn");
  const playPauseBtn = container.querySelector("#yt-play-pause-btn");
  const muteBtn = container.querySelector("#yt-mute-btn");
  const volumeSlider = container.querySelector("#yt-volume-slider");
  const timeCurrent = container.querySelector("#yt-time-current");
  const timeDuration = container.querySelector("#yt-time-duration");
  const progressContainer = container.querySelector("#yt-progress-container");
  const progressFill = container.querySelector("#yt-progress-fill");
  const speedSelect = container.querySelector("#yt-speed-select");
  const fullscreenBtn = container.querySelector("#yt-fullscreen-btn");

  let player = null;
  let updateInterval = null;
  let idleTimeout = null;

  // Inactivity / Idle control bar auto-hide
  const resetIdleTimer = () => {
    container.classList.remove("idle");
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      if (player && player.getPlayerState && player.getPlayerState() === window.YT.PlayerState.PLAYING) {
        container.classList.add("idle");
      }
    }, 3000);
  };

  container.addEventListener("mousemove", resetIdleTimer);
  container.addEventListener("touchstart", resetIdleTimer, { passive: true });

  // Load YouTube API and instantiate player
  const YT = await ensureYouTubeApi();

  player = new YT.Player(ytTargetId, {
    videoId: videoEntry.youtubeVideoId,
    playerVars: {
      autoplay: 0,
      controls: 0,        // Hide YouTube native controls
      rel: 0,             // Don't show external videos
      playsinline: 1,     // Inline play on iOS
      fs: 0,              // Disable native YouTube fullscreen button
      disablekb: 1,       // Disable YouTube keyboard shortcuts
      modestbranding: 1,  // Hide YouTube logo in control bar
      iv_load_policy: 3,  // Hide annotations
    },
    events: {
      onReady: () => {
        if (spinner) spinner.style.display = "none";
        if (bigPlayBtn) bigPlayBtn.style.display = "flex";

        if (player.getDuration) {
          timeDuration.textContent = formatTime(player.getDuration());
        }

        // Start progress update interval
        updateInterval = setInterval(updateProgress, 100);
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          container.classList.add("playing");
          if (bigPlayBtn) bigPlayBtn.style.display = "none";
          if (playPauseBtn) playPauseBtn.textContent = "⏸";
          resetIdleTimer();
        } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
          container.classList.remove("playing", "idle");
          if (bigPlayBtn) bigPlayBtn.style.display = "flex";
          if (playPauseBtn) playPauseBtn.textContent = "▶";
        } else if (e.data === YT.PlayerState.BUFFERING) {
          if (spinner) spinner.style.display = "block";
        }
      },
    },
  });

  // Continuous Progress & Time Sync
  const updateProgress = () => {
    if (!player || typeof player.getCurrentTime !== "function") return;

    const cur = player.getCurrentTime() || 0;
    const dur = player.getDuration() || 0;

    if (dur > 0) {
      const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (timeCurrent) timeCurrent.textContent = formatTime(cur);
      if (timeDuration) timeDuration.textContent = formatTime(dur);
    }
  };

  // Play / Pause Toggle
  const togglePlayPause = () => {
    if (!player || typeof player.getPlayerState !== "function") return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  if (shield) shield.addEventListener("click", togglePlayPause);
  if (bigPlayBtn) bigPlayBtn.addEventListener("click", togglePlayPause);
  if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlayPause);

  // Seek Progress Bar Click & Drag
  if (progressContainer) {
    const handleSeek = (e) => {
      if (!player || typeof player.getDuration !== "function") return;
      const rect = progressContainer.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const pct = clickX / rect.width;
      const targetTime = pct * player.getDuration();
      player.seekTo(targetTime, true);
    };

    progressContainer.addEventListener("click", handleSeek);
  }

  // Volume & Mute Controls
  if (muteBtn && volumeSlider) {
    let lastVolume = 100;

    muteBtn.addEventListener("click", () => {
      if (!player) return;
      if (player.isMuted && player.isMuted()) {
        player.unMute();
        muteBtn.textContent = "🔊";
        volumeSlider.value = lastVolume || 100;
        player.setVolume(lastVolume || 100);
      } else {
        lastVolume = player.getVolume ? player.getVolume() : 100;
        player.mute();
        muteBtn.textContent = "🔇";
        volumeSlider.value = 0;
      }
    });

    volumeSlider.addEventListener("input", (e) => {
      if (!player || typeof player.setVolume !== "function") return;
      const val = Number(e.target.value);
      player.setVolume(val);
      if (val === 0) {
        player.mute();
        muteBtn.textContent = "🔇";
      } else {
        player.unMute();
        muteBtn.textContent = "🔊";
      }
    });
  }

  // Playback Speed Selector
  if (speedSelect) {
    speedSelect.addEventListener("change", (e) => {
      if (!player || typeof player.setPlaybackRate !== "function") return;
      const rate = Number(e.target.value);
      player.setPlaybackRate(rate);
    });
  }

  // Custom Fullscreen Toggle
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    });
  }
}
