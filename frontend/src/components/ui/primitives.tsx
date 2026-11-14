"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      primary:
        "bg-[#2A6A3E] text-white hover:bg-[#1E522E] border border-[#2A6A3E]",
      secondary:
        "bg-[#EEEDE6] text-[#1A221C] hover:bg-[#E3E1D7] border border-[#DFDDD3]",
      outline:
        "bg-white text-[#1A221C] hover:bg-[#F6F5F0] border border-[#DFDDD3]",
      ghost:
        "bg-transparent text-[#4A564D] hover:bg-[#EEEDE6] hover:text-[#1A221C] border border-transparent",
      danger:
        "bg-[#A63A2B] text-white hover:bg-[#8E3023] border border-[#A63A2B]",
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
          "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A6A3E] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
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
        "bg-white border border-[#DFDDD3] rounded-2xl p-5",
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
  const textColors = {
    good: "text-[#1E522E]",
    water: "text-[#1D5266]",
    warn: "text-[#7D4F10]",
    risk: "text-[#8E2F22]",
    neutral: "text-[#4A564D]",
  };
  const dotColors = {
    good: "bg-[#2A6A3E]",
    water: "bg-[#25647C]",
    warn: "bg-[#9A6318]",
    risk: "bg-[#A63A2B]",
    neutral: "bg-[#6B786E]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium",
        textColors[tone],
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
      "h-10 w-full rounded-lg border border-[#DFDDD3] bg-white px-3 text-[14px] text-[#1A221C] placeholder:text-[#6B786E] focus:outline-none focus:border-[#2A6A3E]",
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
        "h-10 w-full rounded-lg border border-[#DFDDD3] bg-white px-3 text-[14px] text-[#1A221C] focus:outline-none focus:border-[#2A6A3E]",
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
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[#EEEDE6] border border-[#DFDDD3]">
        <SliderPrimitive.Range className="absolute h-full bg-[#2A6A3E]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-[#2A6A3E] bg-white transition-colors focus-visible:outline-2 focus-visible:outline-[#2A6A3E] cursor-pointer" />
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
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[#DFDDD3] bg-[#EEEDE6] transition-colors data-[state=checked]:bg-[#2A6A3E] data-[state=checked]:border-[#2A6A3E]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white border border-[#DFDDD3] transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-xl max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#DFDDD3] bg-white p-6">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#DFDDD3]">
            <div>
              <DialogPrimitive.Title className="text-[18px] font-semibold text-[#1A221C]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-[13px] text-[#4A564D]">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="rounded-lg p-1.5 text-[#6B786E] hover:bg-[#EEEDE6] hover:text-[#1A221C] cursor-pointer"
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
