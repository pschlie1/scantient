import { type SelectHTMLAttributes, forwardRef } from "react";

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  name: string;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ label, error, className = "", id, name, children, ...props }, ref) => {
    const selectId = id ?? name;
    return (
      <div>
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1 block text-xs font-medium text-muted"
          >
            {label}
          </label>
        )}
        {/* eslint-disable-next-line design-system/form-wrapper */}
        <select
          ref={ref}
          id={selectId}
          name={name}
          className={`w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-heading focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover ${error ? "border-error" : ""} ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>
    );
  }
);
FormSelect.displayName = "FormSelect";
