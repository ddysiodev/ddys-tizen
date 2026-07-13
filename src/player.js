(function (global) {
  'use strict';

  function createPlayer(options) {
    var screen = document.getElementById('playerScreen');
    var video = document.getElementById('fallbackVideo');
    var title = document.getElementById('playerTitle');
    var source = document.getElementById('playerSource');
    var status = document.getElementById('playerStatus');
    var onStop = options && options.onStop ? options.onStop : function () {};
    var current = null;
    var usingAvplay = hasAvplay();
    var prepared = false;
    var paused = false;

    function open(resource, movie) {
      current = { resource: resource, movie: movie, startedAt: Date.now() };
      prepared = false;
      paused = false;
      title.textContent = movie && movie.title ? movie.title : resource.title || 'DDYS';
      source.textContent = resource.title || resource.group || '播放资源';
      status.textContent = '正在打开播放器';
      screen.hidden = false;
      screen.classList.add('is-active');
      if (usingAvplay) openAvplay(resource.url);
      else openVideo(resource.url);
    }

    function openAvplay(url) {
      try {
        stopAvplay(false);
        global.webapis.avplay.open(url);
        global.webapis.avplay.setDisplayRect(0, 0, global.innerWidth || 1920, global.innerHeight || 1080);
        if (typeof global.webapis.avplay.setDisplayMethod === 'function') {
          global.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
        }
        global.webapis.avplay.setListener({
          onbufferingstart: function () { setStatus('缓冲中'); },
          onbufferingprogress: function (percent) { setStatus('缓冲中 ' + percent + '%'); },
          onbufferingcomplete: function () { setStatus('播放中'); },
          onstreamcompleted: function () { stop(); },
          onerror: function (error) { setStatus('播放错误：' + error); }
        });
        global.webapis.avplay.prepareAsync(function () {
          prepared = true;
          global.webapis.avplay.play();
          setStatus('播放中');
        }, function (error) {
          setStatus('准备播放失败：' + error);
        });
      } catch (error) {
        setStatus('AVPlay 不可用，切换浏览器播放器');
        usingAvplay = false;
        openVideo(url);
      }
    }

    function openVideo(url) {
      video.src = url;
      video.controls = false;
      video.hidden = false;
      video.play().then(function () {
        setStatus('播放中');
      }).catch(function (error) {
        setStatus('浏览器播放失败：' + (error && error.message ? error.message : error));
      });
    }

    function toggle() {
      if (usingAvplay) {
        if (!prepared) return;
        if (paused) {
          global.webapis.avplay.play();
          paused = false;
          setStatus('播放中');
        } else {
          global.webapis.avplay.pause();
          paused = true;
          setStatus('已暂停');
        }
        return;
      }
      if (video.paused) video.play();
      else video.pause();
      setStatus(video.paused ? '已暂停' : '播放中');
    }

    function seek(deltaSeconds) {
      var target;
      if (usingAvplay && prepared) {
        try {
          target = Math.max(0, global.webapis.avplay.getCurrentTime() + deltaSeconds * 1000);
          global.webapis.avplay.seekTo(target);
          setStatus(deltaSeconds > 0 ? '快进' : '快退');
        } catch (error) {}
        return;
      }
      if (video.duration) {
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSeconds));
      }
    }

    function stop() {
      if (current) onStop(current);
      stopAvplay(true);
      video.pause();
      video.removeAttribute('src');
      try { video.load(); } catch (error) {}
      current = null;
      prepared = false;
      paused = false;
      screen.classList.remove('is-active');
      screen.hidden = true;
    }

    function stopAvplay(closeOnly) {
      if (!hasAvplay()) return;
      try {
        if (global.webapis.avplay.getState && global.webapis.avplay.getState() !== 'NONE') {
          global.webapis.avplay.stop();
        }
      } catch (error) {}
      if (!closeOnly) {
        try { global.webapis.avplay.close(); } catch (error) {}
      }
    }

    function setStatus(text) {
      status.textContent = text;
    }

    function selfCheck() {
      return {
        avplay: hasAvplay(),
        fallbackVideo: !!video && typeof video.play === 'function',
        current: !!current
      };
    }

    return {
      open: open,
      toggle: toggle,
      seek: seek,
      stop: stop,
      selfCheck: selfCheck,
      isActive: function () { return !!current; },
      isAvplay: function () { return usingAvplay; }
    };
  }

  function hasAvplay() {
    return !!(global.webapis && global.webapis.avplay && typeof global.webapis.avplay.open === 'function');
  }

  global.DDYSPlayer = { create: createPlayer, hasAvplay: hasAvplay };
})(typeof window !== 'undefined' ? window : globalThis);
