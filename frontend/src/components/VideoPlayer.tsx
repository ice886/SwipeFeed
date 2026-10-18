import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '../api/client';

interface VideoPlayerProps {
  playUrl: string;
  coverUrl?: string;
  className?: string;
  /** 进入视口才播放（Feed 沉浸流用） */
  playWhenVisible?: boolean;
  /** 静音播放（默认开启，浏览器自动播放策略要求） */
  defaultMuted?: boolean;
  loop?: boolean;
  /** 展示静音开关 */
  showSoundToggle?: boolean;
}

export default function VideoPlayer({
  playUrl,
  coverUrl,
  className = '',
  playWhenVisible = false,
  defaultMuted = true,
  loop = true,
  showSoundToggle = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(defaultMuted);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [loading, setLoading] = useState(true);

  // 同步静音状态
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  // 进入视口自动播放 / 离开暂停
  useEffect(() => {
    const v = videoRef.current;
    const container = containerRef.current;
    if (!v || !container) return;
    if (!playWhenVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void v.play().catch(() => undefined);
          } else {
            v.pause();
          }
        }
      },
      { threshold: 0.55 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [playWhenVisible, playUrl]);

  // 非视口模式：加载完自动播放
  useEffect(() => {
    if (playWhenVisible) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch(() => undefined);
  }, [playWhenVisible, playUrl]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play()
        .then(() => {
          setShowPlayIcon(false);
        })
        .catch(() => undefined);
    } else {
      v.pause();
      setShowPlayIcon(true);
      window.setTimeout(() => setShowPlayIcon(false), 600);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden bg-black ${className}`}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={assetUrl(playUrl)}
        poster={coverUrl ? assetUrl(coverUrl) : undefined}
        className="h-full w-full cursor-pointer object-cover"
        muted={muted}
        loop={loop}
        playsInline
        preload="metadata"
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onLoadedData={() => setLoading(false)}
      />

      {/* 加载指示 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-rose-500" />
        </div>
      )}

      {/* 暂停图标反馈 */}
      {showPlayIcon && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      )}

      {/* 静音开关 */}
      {showSoundToggle && (
        <button
          type="button"
          aria-label={muted ? '打开声音' : '关闭声音'}
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-black/70"
        >
          {muted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
              <path d="m23 9-6 6M17 9l6 6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
