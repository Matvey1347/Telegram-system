"use client";

import { useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { iconsApi } from "@/lib/api";
import { FormField } from "@/components/ui/primitives";

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

  useEffect(() => {
    return () => onUploadingChange?.(false);
  }, [onUploadingChange]);

  return (
    <FormField label={label}>
      {!readOnly ? (
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/50 px-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white ${
            compact ? "h-[38px] py-2" : "py-5"
          } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <ImagePlus size={18} />
          Upload images
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || uploadingPreviews.length > 0}
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              if (!files.length) return;
              const previews = files.map((file) => URL.createObjectURL(file));
              setUploadingPreviews(previews);
              onUploadingChange?.(true);
              try {
                const uploaded = await Promise.all(
                  files.map((file) => iconsApi.upload(file)),
                );
                onChange([...value, ...uploaded.map((item) => item.imageUrl)]);
              } finally {
                previews.forEach((preview) => URL.revokeObjectURL(preview));
                setUploadingPreviews([]);
                onUploadingChange?.(false);
              }
            }}
          />
        </label>
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
