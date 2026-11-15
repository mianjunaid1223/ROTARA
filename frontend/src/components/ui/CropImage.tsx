"use client";

import { useState } from "react";
import { Layers, Sprout } from "@/components/ui/icons";
import { cn, isNoneOrFallowCrop } from "@/lib/utils";

const KNOWN_CROPS = new Set([
  "berseem",
  "chickpea",
  "cotton",
  "dhaincha",
  "lentil",
  "maize",
  "mung_bean",
  "mustard",
  "rice",
  "sorghum_millet",
  "sugarcane",
  "wheat",
]);

interface CropImageProps {
  cropId?: string | null;
  alt: string;
  size?: number;
  className?: string;
}

export function CropImage({ cropId, alt, size = 64, className }: CropImageProps) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const normalized = cropId?.trim().toLowerCase() ?? "";
  const isFallow = isNoneOrFallowCrop(normalized);
  const valid = Boolean(!isFallow && KNOWN_CROPS.has(normalized) && failedId !== normalized);

  if (isFallow) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col items-center justify-center rounded-lg border border-[#D5D3C8] bg-[#EAE8E0] text-[#5A6B5D]",
          className
        )}
        style={{ width: size, height: size }}
        title="None / Fallow (Bare soil)"
      >
        <Layers className="h-1/2 w-1/2" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border border-[#B8D4C0] bg-[#E6F0E9] text-[#1F5E36]",
          className
        )}
        style={{ width: size, height: size }}
      >
        <Sprout className="h-1/2 w-1/2" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/crops/${normalized}.png`}
      alt={alt}
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      onError={() => setFailedId(normalized)}
      className={cn(
        "shrink-0 rounded-lg border border-[#D5D3C8] bg-[#F8F7F3] object-contain p-1",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
