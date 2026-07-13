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
      if (!resource || !resource.url) {
        setStatus('No playable URL.');
        return;
      }
      current = { resource: resource, movie: movie, startedAt: Date.now() };
      prepared = false;
      paused = false;
      title.textContent = movie && movie.title ? movie.title : resource.title || 'DDYS';
      source.textContent = resource.title || resource.group || 'Playback Resource';
      status.textContent = 'Opening player...';
      screen.hidden = false;
      screen.classList.add('is-active');
      usingAvplay = hasAvplay();
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
          onbufferingstart: function () { setStatus('Buffering...'); },
          onbufferingprogress: function (percent) { setStatus('Buffering ' + percent + '%'); },
          onbufferingcomplete: function () { setStatus('Playing'); },
          onstreamcompleted: function () { stop(); },
          onerror: function (error) {
            setStatus('Playback error: ' + error);
          }
        });
        global.webapis.avplay.prepareAsync(function () {
          prepared = true;
          global.webapis.avplay.play();
          setStatus('Playing');
        }, function (error) {
          setStatus('AVPlay prepare failed, trying browser video: ' + error);
          usingAvplay = false;
          openVideo(url);
        });
      } catch (error) {
        setStatus('AVPlay unavailable, using browser video.');
        usingAvplay = false;
        openVideo(url);
      }
    }

    function openVideo(url) {
      try {
        video.src = url;
        video.controls = false;
        video.hidden = false;
        video.play().then(function () {
          setStatus('Playing');
        }).catch(function (error) {
          setStatus('Browser playback failed: ' + (error && error.message ? error.message : error));
        });
      } catch (error) {
        setStatus('Browser playback failed: ' + (error && error.message ? error.message : error));
      }
    }

    function toggle() {
      if (usingAvplay) {
        if (!prepared) return;
        if (paused) {
          global.webapis.avplay.play();
          paused = false;
          setStatus('Playing');
        } else {
          global.webapis.avplay.pause();
          paused = true;
          setStatus('Paused');
        }
        return;
      }
      if (video.paused) video.play();
      else video.pause();
      setStatus(video.paused ? 'Paused' : 'Playing');
    }

    function seek(deltaSeconds) {
      var target;
      if (usingAvplay && prepared) {
        try {
          target = Math.max(0, global.webapis.avplay.getCurrentTime() + deltaSeconds * 1000);
          global.webapis.avplay.seekTo(target);
          setStatus(deltaSeconds > 0 ? 'Fast forward' : 'Rewind');
        } catch (error) {}
        return;
      }
      if (video.duration) {
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSeconds));
      }
    }

    function stop() {
      if (current) onStop(current);
      stopAvplay(false);
      video.pause();
      video.removeAttribute('src');
      video.hidden = true;
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
      if (status) status.textContent = text;
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
