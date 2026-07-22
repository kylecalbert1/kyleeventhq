import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-xs font-medium leading-none cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 border-2 border-transparent",
  {
    variants: {
      variant: {
        // Saturated primary — reserve for the single main action per view.
        default: "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90",
        // Reconfirm-style outline: warm white surface, 2px border, ink text.
        outline: "bg-card text-foreground border-border hover:bg-accent",
        // Tinted pastel — cream bg + amber border + amber text (Reconfirm secondary).
        secondary: "bg-[oklch(0.975_0.02_85)] text-[oklch(0.42_0.14_60)] border-[oklch(0.88_0.10_75)] hover:bg-[oklch(0.965_0.03_85)]",
        ghost: "border-transparent hover:bg-accent hover:text-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 6px 12px padding, 12px font — Reconfirm default.
        default: "px-3 py-1.5",
        sm: "px-2 py-1 text-[11px]",
        lg: "px-4 py-2 text-sm",
        icon: "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
