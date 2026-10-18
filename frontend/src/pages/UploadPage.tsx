import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as videoApi from '../api/video';
import type { UploadProgress } from '../api/video';
import { useAuth } from '../context/AuthContext';
import { extractTags, formatBytes } from '../utils/format';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import UploadDropzone from '../components/UploadDropzone';
import { useToast } from '../components/Toast';

const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 契约上限 200MB
const MAX_COVER_SIZE = 10 * 1024 * 1024;

const PHASE_TEXT: Record<UploadProgress['phase'], string> = {
  hashing: '计算文件 MD5…',
  uploading: '上传中…',
  finishing: '合并处理…',
};

/** 从视频自动截取首帧作为封面 */
async function captureCoverFromVideo(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };
    const done = (result: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    video.onloadeddata = () => {
      try {
        const target = Math.min(1, Math.max(0, video.duration ? video.duration * 0.1 : 0.1));
        video.currentTime = target;
      } catch {
        done(null);
      }
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          done(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          done(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob) done(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
            else done(null);
          },
          'image/jpeg',
          0.85,
        );
      } catch {
        done(null);
      }
    };
    video.onerror = () => done(null);
    window.setTimeout(() => done(null), 5000);
    video.src = url;
  });
}

export default function UploadPage() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const { error: toastError, success, toast } = useToast();

  // 视频
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoProgress, setVideoProgress] = useState<UploadProgress | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);

  // 封面
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);

  // 表单
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [publishing, setPublishing] = useState(false);
  const uploadSeq = useRef(0);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const uploadCover = useCallback(
    async (file: File) => {
      setCoverUploading(true);
      setCoverProgress(0);
      try {
        const res = await videoApi.uploadCover(file, (p) => setCoverProgress(p));
        setCoverUrl(res.cover_url ?? res.url);
        success('封面上传成功');
      } catch (err) {
        setCoverUrl(null);
        toastError(err instanceof Error ? err.message : '封面上传失败');
      } finally {
        setCoverUploading(false);
      }
    },
    [success, toastError],
  );

  const handleVideoFile = useCallback(
    async (file: File | null) => {
      const seq = ++uploadSeq.current;
      setVideoFile(file);
      setPlayUrl(null);
      setVideoProgress(null);
      if (!file) return;

      setVideoUploading(true);
      try {
        const res = await videoApi.uploadVideoFile(file, (p) => {
          if (seq === uploadSeq.current) setVideoProgress(p);
        });
        if (seq !== uploadSeq.current) return;
        setPlayUrl(res.play_url ?? res.url);
        success('视频上传成功');

        // 自动截取封面（失败则要求手动上传）
        const autoCover = await captureCoverFromVideo(file);
        if (seq !== uploadSeq.current) return;
        if (autoCover) {
          setCoverFile(autoCover);
          setCoverPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(autoCover);
          });
          await uploadCover(autoCover);
        }
      } catch (err) {
        if (seq === uploadSeq.current) {
          setPlayUrl(null);
          toastError(err instanceof Error ? err.message : '视频上传失败');
        }
      } finally {
        if (seq === uploadSeq.current) setVideoUploading(false);
      }
    },
    [success, toastError, uploadCover],
  );

  const handleCoverFile = useCallback(
    (file: File | null) => {
      setCoverFile(file);
      setCoverUrl(null);
      setCoverPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file ? URL.createObjectURL(file) : null;
      });
      if (file) void uploadCover(file);
    },
    [uploadCover],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (publishing) return;
    if (!title.trim()) {
      toast('请填写标题', 'error');
      return;
    }
    if (!playUrl) {
      toast(videoUploading ? '视频还在上传中，请稍候' : '请先上传视频', 'error');
      return;
    }
    if (!coverUrl) {
      toast(coverUploading ? '封面还在上传中，请稍候' : '请上传封面图', 'error');
      return;
    }
    setPublishing(true);
    try {
      const res = await videoApi.publish({
        title: title.trim(),
        description: description.trim(),
        play_url: playUrl,
        cover_url: coverUrl,
      });
      success('发布成功！');
      navigate(res.video?.id ? `/video/${res.video.id}` : '/');
    } catch (err) {
      toastError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-24">
        <EmptyState
          title="发布视频需要登录"
          description="登录后即可上传并发布你的作品"
          action={
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-2 rounded-full bg-rose-500 px-6 py-2 text-sm text-white hover:bg-rose-400"
            >
              去登录
            </button>
          }
        />
      </div>
    );
  }

  const tags = extractTags(`${title} ${description}`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-24">
      <div className="animate-fade-in-up space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">发布视频</h1>
          <p className="mt-1 text-sm text-zinc-500">
            小于 30MB 直传，大于 30MB 自动使用 5MB 分片上传（spark-md5 校验 + 断点续传）
          </p>
        </div>

        {/* 视频上传 */}
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-300">
            1. 选择视频 <span className="text-rose-400">*</span>
          </h2>
          <UploadDropzone
            title="上传视频文件"
            accept="video/mp4,video/*"
            maxSize={MAX_VIDEO_SIZE}
            file={videoFile}
            onFile={(f) => void handleVideoFile(f)}
            disabled={videoUploading}
            hint={`支持 mp4 等格式，最大 ${formatBytes(MAX_VIDEO_SIZE)}；当前文件将自动上传`}
          />
          {(videoUploading || playUrl) && (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">
                  {playUrl ? (
                    <span className="text-emerald-400">✓ 视频上传完成</span>
                  ) : (
                    PHASE_TEXT[videoProgress?.phase ?? 'uploading']
                  )}
                </span>
                <span className="text-zinc-500">{videoProgress?.percent ?? 0}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    playUrl ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-orange-400'
                  }`}
                  style={{ width: `${playUrl ? 100 : videoProgress?.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* 封面上传 */}
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-300">
            2. 封面图 <span className="text-rose-400">*</span>
          </h2>
          <UploadDropzone
            title="上传封面图（已自动截取首帧，可替换）"
            accept="image/jpeg,image/png,image/webp"
            maxSize={MAX_COVER_SIZE}
            file={coverFile}
            onFile={handleCoverFile}
            previewUrl={coverPreview}
            compact
            disabled={coverUploading}
            hint="支持 jpg/png/webp，最大 10MB；默认使用视频首帧"
          />
          {coverUploading && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                style={{ width: `${coverProgress}%` }}
              />
            </div>
          )}
        </section>

        {/* 表单 */}
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-300">
              3. 标题 <span className="text-rose-400">*</span>
            </h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="写个好标题吸引更多人（可带 #话题）"
              maxLength={80}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/60"
            />
            <div className="mt-1 text-right text-xs text-zinc-600">{title.length}/80</div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-300">4. 简介</h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="添加简介，用 #话题 参与讨论，@用户名 提及好友…"
              rows={4}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/60"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-600">
              <span>
                {tags.length > 0 ? (
                  <>
                    识别到话题：
                    {tags.map((t) => (
                      <span key={t} className="ml-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-cyan-400">
                        #{t}
                      </span>
                    ))}
                  </>
                ) : (
                  '输入 #话题 自动识别并归入话题页'
                )}
              </span>
              <span>{description.length}/500</span>
            </div>
          </section>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={publishing || videoUploading || coverUploading}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:opacity-90 disabled:opacity-50"
            >
              {publishing && <Spinner size={16} />}
              发布
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-full border border-zinc-800 px-6 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-white"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
