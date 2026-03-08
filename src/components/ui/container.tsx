import { type HTMLAttributes, forwardRef } from "react";

export const Container = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className = "", ...props }, ref) => (
  <div
    ref={ref}
    className={`mx-auto max-w-[1200px] px-6 ${className}`}
    {...props}
  />
));
Container.displayName = "Container";
