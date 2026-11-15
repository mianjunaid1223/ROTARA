"use client";

import { useState } from "react";
import Image from "next/image";
import { Sprout } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

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
  const [failed, setFailed] = useState(false);
  const valid = Boolean(cropId && KNOWN_CROPS.has(cropId) && !failed);

  if (!valid) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-100 text-emerald-700",
          className
        )}
        style={{ width: size, height: size }}
      >
        <Sprout className="h-1/2 w-1/2" />
      </div>
    );
  }

  return (
    <Image
      src={`/crops/${cropId}.png`}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-lg border border-stone-200 bg-white object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
