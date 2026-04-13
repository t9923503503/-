"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

type Notice = { type: "success" | "error"; text: string } | null;

const MULTIPART_OVERHEAD_BYTES = 32 * 1024;
const SAFE_REQUEST_BYTES = 380 * 1024;
const MAX_UPLOAD_BYTES = SAFE_REQUEST_BYTES - MULTIPART_OVERHEAD_BYTES;
const MAX_IMAGE_SIDE = 1280;
const MIN_IMAGE_SIDE = 360;
const TARGET_UPLOAD_LABEL = `до ~${Math.round(MAX_UPLOAD_BYTES / 1024)} KB`;

function toJpegFileName(name: string): string {
  const base = String(name || "photo").replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };
    img.src = objectUrl;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("IMAGE_ENCODE_FAILED"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function prepareUploadFile(file: File): Promise<File> {
  const shouldNormalize = file.size > MAX_UPLOAD_BYTES || file.type !== "image/jpeg";
  if (!shouldNormalize) return file;

  const img = await loadImage(file);
  const sourceWidth = img.naturalWidth || img.width || 1;
  const sourceHeight = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight));

  let width = Math.max(1, Math.round(sourceWidth * scale));
  let height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("NO_CANVAS_CONTEXT");

  const render = (nextWidth: number, nextHeight: number) => {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    context.clearRect(0, 0, nextWidth, nextHeight);
    context.drawImage(img, 0, 0, nextWidth, nextHeight);
  };

  render(width, height);
  const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42, 0.34];

  for (const quality of qualitySteps) {
    const blob = await canvasToJpegBlob(canvas, quality);
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return new File([blob], toJpegFileName(file.name), { type: "image/jpeg" });
    }
  }

  while (width > MIN_IMAGE_SIDE && height > MIN_IMAGE_SIDE) {
    width = Math.max(MIN_IMAGE_SIDE, Math.round(width * 0.82));
    height = Math.max(MIN_IMAGE_SIDE, Math.round(height * 0.82));
    render(width, height);

    for (const quality of qualitySteps) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (blob.size <= MAX_UPLOAD_BYTES) {
        return new File([blob], toJpegFileName(file.name), { type: "image/jpeg" });
      }
    }
  }

  throw new Error("FILE_TOO_LARGE");
}

export default function PlayerPhotoUploadForm({
  playerId,
  embedded = false,
}: {
  playerId?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = useMemo(() => !!file && !loading, [file, loading]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!file) {
      setNotice({ type: "error", text: "Выберите файл." });
      return;
    }

    setLoading(true);
    try {
      const uploadFile = await prepareUploadFile(file);

      const fd = new FormData();
      fd.append("photo", uploadFile);
      if (playerId) fd.append("playerId", playerId);

      const res = await fetch("/api/auth/photo", { method: "POST", body: fd });
      if (res.status === 413) {
        setNotice({
          type: "error",
          text: "Файл всё ещё превышает лимит прокси. Выберите более лёгкое фото и повторите попытку.",
        });
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          type: "error",
          text: data?.error || "Не удалось загрузить фото.",
        });
        return;
      }

      setNotice({
        type: "success",
        text: data?.message || "Фото обновлено.",
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl("");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      if (error instanceof Error && error.message === "FILE_TOO_LARGE") {
        setNotice({
          type: "error",
          text: "Фото не удалось сжать до лимита. Выберите менее крупное изображение.",
        });
      } else {
        setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
      }
    } finally {
      setLoading(false);
    }
  }

  const rootClass = embedded
    ? ''
    : 'rounded-xl border border-white/10 bg-surface-light/20 p-4';

  return (
    <section className={rootClass}>
      {!embedded ? (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Обновление фото
          </div>
          <p className="mt-1.5 text-sm font-body text-text-secondary">
            JPG, PNG или WEBP. Фото автоматически приводится к JPEG и сжимается перед отправкой (
            {TARGET_UPLOAD_LABEL}).
          </p>
        </>
      ) : (
        <p className="text-sm font-body text-text-secondary">
          JPG, PNG или WEBP. Фото автоматически приводится к JPEG и сжимается перед отправкой (
          {TARGET_UPLOAD_LABEL}).
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const nextFile = e.currentTarget.files?.[0] || null;
            setFile(nextFile);
            setNotice(null);
            if (previewUrl.startsWith("blob:")) {
              URL.revokeObjectURL(previewUrl);
            }
            if (nextFile) {
              setPreviewUrl(URL.createObjectURL(nextFile));
            } else {
              setPreviewUrl("");
            }
          }}
          className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-brand/20 file:px-4 file:py-2 file:text-brand-light hover:file:bg-brand/30"
        />

        {previewUrl ? (
          <div className="h-28 w-28 overflow-hidden rounded-2xl border border-white/10">
            <img src={previewUrl} alt="preview" className="h-full w-full object-cover" />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className={["btn-action-outline w-full sm:w-auto", !canSubmit ? "cursor-not-allowed opacity-60" : ""].join(" ")}
        >
          {loading ? "Загрузка..." : "Сохранить фото"}
        </button>
      </form>

      {notice ? (
        <div
          className={[
            "mt-3 rounded-lg border px-4 py-3 text-sm font-body",
            notice.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/40 bg-red-500/10 text-red-200",
          ].join(" ")}
          role="status"
        >
          {notice.text}
        </div>
      ) : null}
    </section>
  );
}
