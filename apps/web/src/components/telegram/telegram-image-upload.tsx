"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { ImagePlus, Link2, LoaderCircle, Plus, X } from "lucide-react";
import { iconsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { Button, FormField, Input } from "@/components/ui/primitives";

export function TelegramImageUpload({
  value,
  onChange,
  disabled,
  readOnly,
  compact,
  label = "Images",
  onUploadingChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  label?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingFromUrl, setUploadingFromUrl] = useState(false);
  const [pasteFocused, setPasteFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { pushToast } = useAppToast();

  const uploadBusy = uploadingPreviews.length > 0 || uploadingFromUrl;
  const disabledState = disabled || uploadBusy;
  const helperText = useMemo(
    () =>
      compact
        ? "Upload, paste with Ctrl/Cmd+V, or add an image URL"
        : "Upload images, paste with Ctrl/Cmd+V, or load by image URL",
    [compact],
  );

  useEffect(() => {
    return () => onUploadingChange?.(false);
  }, [onUploadingChange]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      pushToast("Only image files can be uploaded.", "error");
      return;
    }

    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    setUploadingPreviews(previews);
    onUploadingChange?.(true);
    try {
      const uploaded = await Promise.all(
        imageFiles.map((file) => iconsApi.upload(file)),
      );
      onChange([...value, ...uploaded.map((item) => item.imageUrl)]);
    } catch (error) {
      pushToast(
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to upload image.",
        "error",
      );
    } finally {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
      setUploadingPreviews([]);
      onUploadingChange?.(false);
    }
  };

  const handlePaste = async (event: ClipboardEvent | ReactClipboardEvent) => {
    if (readOnly || disabledState) return;

    const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length) return;

    event.preventDefault();
    await uploadFiles(files);
  };

  useEffect(() => {
    if (!pasteFocused || readOnly || disabledState) return;

    const onPaste = (event: ClipboardEvent) => {
      void handlePaste(event);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabledState, pasteFocused, readOnly, value]);

  const uploadImageFromUrl = async () => {
    const normalizedUrl = imageUrl.trim();
    if (!normalizedUrl) return;

    setUploadingFromUrl(true);
    onUploadingChange?.(true);
    try {
      const response = await fetch(normalizedUrl);
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("The URL does not point to an image.");
      }

      let filename = "telegram-image";
      try {
        const parsedUrl = new URL(normalizedUrl);
        const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).at(-1);
        if (lastSegment) filename = lastSegment;
      } catch {}

      if (!/\.[a-z0-9]+$/i.test(filename)) {
        const extension = blob.type.split("/")[1] || "png";
        filename = `${filename}.${extension}`;
      }

      const file = new File([blob], filename, { type: blob.type });
      await uploadFiles([file]);
      setImageUrl("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load image from URL.";
      pushToast(message, "error");
      onUploadingChange?.(false);
    } finally {
      setUploadingFromUrl(false);
    }
  };

  return (
    <FormField label={label}>
      {!readOnly ? (
        <div className="space-y-3">
          <div
            tabIndex={disabledState ? -1 : 0}
            onFocus={() => setPasteFocused(true)}
            onBlur={() => setPasteFocused(false)}
            onPaste={(event) => {
              void handlePaste(event);
            }}
            className={`rounded-lg border border-dashed ${
              pasteFocused ? "border-blue-600" : "border-neutral-700"
            } bg-neutral-950/50 p-3 transition ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm text-neutral-300 hover:text-white ${
                compact ? "h-[38px] py-2" : "py-3"
              }`}
            >
              <ImagePlus size={18} />
              {uploadBusy ? "Uploading images..." : "Upload images"}
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                multiple
                disabled={disabledState}
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = "";
                  await uploadFiles(files);
                }}
              />
            </label>
            <div className="mt-1 flex items-center justify-center gap-2 text-center text-xs text-neutral-500">
              <Plus size={12} />
              <span>{helperText}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://example.com/image.png"
                disabled={disabledState}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void uploadImageFromUrl();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={disabledState || !imageUrl.trim()}
              onClick={() => {
                void uploadImageFromUrl();
              }}
            >
              <span className="inline-flex items-center gap-2">
                {uploadingFromUrl ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Link2 size={15} />
                )}
                Add by URL
              </span>
            </Button>
          </div>
        </div>
      ) : null}
      {value.length || uploadingPreviews.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      value.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="absolute right-1 top-1 rounded-md bg-black/75 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ))}
          {uploadingPreviews.map((url, index) => (
            <div
              key={`uploading-${url}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-blue-700/70 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Uploading image ${index + 1}`}
                className="h-full w-full object-contain opacity-35 blur-[1px]"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/25 text-blue-200">
                <LoaderCircle size={22} className="animate-spin" />
                <span className="text-[10px]">Uploading</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </FormField>
  );
}
