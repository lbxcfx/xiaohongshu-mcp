import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  iconColor = "text-muted-foreground",
  iconBg = "bg-muted/50",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/40 px-8 py-14 text-center",
        className
      )}
    >
      <div
        className={cn(
          "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl",
          iconBg
        )}
      >
        <Icon className={cn("h-8 w-8", iconColor)} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2.5 max-w-sm text-sm leading-7 text-muted-foreground">
        {description}
      </p>
      {action && (
        <Button
          variant="outline"
          size="sm"
          className="mt-6 rounded-full border-primary/40 px-5 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
          onClick={action.onClick}
        >
          {ActionIcon && <ActionIcon className="mr-1.5 h-3.5 w-3.5" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
