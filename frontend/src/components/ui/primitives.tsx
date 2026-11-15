"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      primary:
        "bg-[#1F5E36] text-white hover:bg-[#164728] border border-[#1F5E36]",
      secondary:
        "bg-[#E6F0E9] text-[#164728] hover:bg-[#D5E6DA] border border-[#B8D4C0]",
      outline:
        "bg-white text-[#141E16] hover:bg-[#F4F3EE] border border-[#D5D3C8]",
      ghost:
        "bg-transparent text-[#38473B] hover:bg-[#EAE8E0] hover:text-[#141E16] border border-transparent",
      danger:
        "bg-[#FBEAE8] text-[#8C261E] hover:bg-[#F5D5D1] border border-[#E8B8B4]",
    };
    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      sm: "h-8 px-3 text-[13px] rounded-lg",
      md: "h-10 px-4 text-[14px] rounded-lg",
      lg: "h-11 px-5 text-[15px] rounded-xl",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F5E36] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-white border border-[#D5D3C8] rounded-xl p-5 text-[#141E16]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatusText({
  tone = "neutral",
  dot = true,
  children,
  className,
}: {
  tone?: "good" | "water" | "warn" | "risk" | "neutral";
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    good: "text-[#165B31] bg-[#E8F3EC] border-[#B7D9C2]",
    water: "text-[#184E68] bg-[#E6F0F5] border-[#B5D2E0]",
    warn: "text-[#7C4A0E] bg-[#F9F0E1] border-[#E5C99B]",
    risk: "text-[#8C261E] bg-[#FBEAE8] border-[#E8B8B4]",
    neutral: "text-[#38473B] bg-[#F4F3EE] border-[#D5D3C8]",
  };
  const dotColors = {
    good: "bg-[#1F5E36]",
    water: "bg-[#184E68]",
    warn: "bg-[#9A6318]",
    risk: "bg-[#A63A2B]",
    neutral: "bg-[#5A6B5D]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium",
        styles[tone],
        className
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColors[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-lg border border-[#D5D3C8] bg-white px-3 text-[14px] text-[#141E16] placeholder:text-[#5A6B5D] focus:outline-none focus:border-[#1F5E36] focus:ring-1 focus:ring-[#1F5E36]",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function SelectNative({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-[#D5D3C8] bg-white px-3 text-[14px] text-[#141E16] focus:outline-none focus:border-[#1F5E36] focus:ring-1 focus:ring-[#1F5E36]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Slider({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center py-2",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[#EAE8E0] border border-[#D5D3C8]">
        <SliderPrimitive.Range className="absolute h-full bg-[#1F5E36]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-[#1F5E36] bg-white transition-colors focus-visible:outline-2 focus-visible:outline-[#1F5E36] cursor-pointer" />
    </SliderPrimitive.Root>
  );
}

export function Switch({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[#D5D3C8] bg-[#EAE8E0] transition-colors data-[state=checked]:bg-[#1F5E36] data-[state=checked]:border-[#1F5E36]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white border border-[#D5D3C8] transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export function ModalDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-xl max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D5D3C8] bg-white p-6 text-[#141E16]">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#D5D3C8]">
            <div>
              <DialogPrimitive.Title className="text-[18px] font-semibold text-[#141E16]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-[13px] text-[#38473B]">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="rounded-lg p-1.5 text-[#5A6B5D] hover:bg-[#EAE8E0] hover:text-[#141E16] cursor-pointer"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </DialogPrimitive.Close>
          </div>
          <div className="pt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
