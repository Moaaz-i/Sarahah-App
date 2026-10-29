import { useEffect, useRef, useState } from 'react';

const formatSeconds = (sec) => {
  if (isNaN(sec) || sec === null || sec === undefined) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * Modern Custom Voice Memo & Audio Player.
 * Replaces the default clunky browser player with a sleek, glassmorphic player.
 */
export default function AudioPlayer({ src, title = 'رسالة صوتية مجهولة', className = '' }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (!duration && audio.duration) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.pause();
    };
  }, [src, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = val;
      setCurrentTime(val);
    }
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextSpeed = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    audio.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`custom-audio-player ${className}`} dir="ltr">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play / Pause Circular Button */}
      <button
        type="button"
        className={`audio-player__play-btn ${isPlaying ? 'is-playing' : ''}`}
        onClick={togglePlay}
        aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل التسجيل الصوتي'}
      >
        {isPlaying ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="2" />
            <rect x="14" y="4" width="4" height="16" rx="2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Audio Wave Visualizer Bars */}
      <div className={`audio-player__wave ${isPlaying ? 'is-active' : ''}`} aria-hidden="true">
        <span className="wave-bar bar-1" />
        <span className="wave-bar bar-2" />
        <span className="wave-bar bar-3" />
        <span className="wave-bar bar-4" />
        <span className="wave-bar bar-5" />
      </div>

      {/* Seeker Track & Timers */}
      <div className="audio-player__track-wrap">
        <div className="audio-player__info">
          <span className="audio-player__title" dir="rtl">{title}</span>
          <span className="audio-player__time">
            {formatSeconds(currentTime)} / {formatSeconds(duration || 30)}
          </span>
        </div>

        <div className="audio-player__seeker">
          <input
            type="range"
            min="0"
            max={duration || 30}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="audio-player__range"
            style={{
              background: `linear-gradient(to right, #7c5cff ${progressPercent}%, rgba(255, 255, 255, 0.12) ${progressPercent}%)`,
            }}
            aria-label="شريط تقدّم التسجيل الصوتي"
          />
        </div>
      </div>

      {/* Playback Speed Pill */}
      <button
        type="button"
        className="audio-player__speed-btn"
        onClick={cycleSpeed}
        title="تغيير سرعة التشغيل"
      >
        {playbackRate}x
      </button>
    </div>
  );
}
