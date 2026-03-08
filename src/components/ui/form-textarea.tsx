import { type TextareaHTMLAttributes, forwardRef } from "react";

interface FormTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  name: string;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, error, className = "", id, name, ...props }, ref) => {
    const textareaId = id ?? name;
    return (
      <div>
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1 block text-xs font-medium text-muted"
          >
            {label}
          </label>
        )}
        {/* eslint-disable-next-line design-system/form-wrapper */}
        <textarea
          ref={ref}
          id={textareaId}
          name={name}
          className={`w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover ${error ? "border-error" : ""} ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>
    );
  }
);
FormTextarea.displayName = "FormTextarea";
