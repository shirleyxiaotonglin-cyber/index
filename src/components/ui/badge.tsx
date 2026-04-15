import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        todo: "border-transparent bg-[hsl(var(--status-todo)/0.2)] text-[hsl(var(--status-todo))]",
        doing: "border-transparent bg-[hsl(var(--status-doing)/0.2)] text-[hsl(var(--status-doing))]",
        blocked: "border-transparent bg-[hsl(var(--status-blocked)/0.2)] text-[hsl(var(--status-blocked))]",
        review: "border-transparent bg-[hsl(var(--status-review)/0.2)] text-[hsl(var(--status-review))]",
        done: "border-transparent bg-[hsl(var(--status-done)/0.2)] text-[hsl(var(--status-done))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
