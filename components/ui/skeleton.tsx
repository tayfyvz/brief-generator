import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}
