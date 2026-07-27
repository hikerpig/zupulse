import { createContext, forwardRef, useContext, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

type FieldContextValue = {
  controlId: string;
  descriptionId?: string;
  errorId?: string;
  invalid: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
}

export function Field({ children, className, description, error, label }: FieldProps) {
  const generatedId = useId();
  const controlId = `field-${generatedId}`;
  const descriptionId = description == null ? undefined : `${controlId}-description`;
  const errorId = error == null ? undefined : `${controlId}-error`;
  const context: FieldContextValue = {
    controlId,
    invalid: error != null,
    ...(descriptionId === undefined ? {} : { descriptionId }),
    ...(errorId === undefined ? {} : { errorId }),
  };

  return (
    <FieldContext.Provider value={context}>
      <div className={classes("tw:grid tw:gap-1", className)}>
        <label htmlFor={controlId} className="tw:font-semibold tw:text-caption tw:text-foreground">
          {label}
        </label>
        {children}
        {description == null ? null : (
          <p id={descriptionId} className="tw:m-0 tw:text-caption tw:text-muted">
            {description}
          </p>
        )}
        {error == null ? null : (
          <p id={errorId} className="tw:font-semibold tw:m-0 tw:text-caption tw:text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export type TextFieldProps = ComponentPropsWithoutRef<"input">;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { "aria-describedby": describedBy, "aria-invalid": invalid, className, id, ...props },
  ref,
) {
  const field = useContext(FieldContext);
  return (
    <input
      {...props}
      ref={ref}
      id={id ?? field?.controlId}
      className={classes(controlClasses, className)}
      aria-describedby={describedByIds(describedBy, field)}
      aria-invalid={field?.invalid ? true : invalid}
    />
  );
});

export type SelectProps = ComponentPropsWithoutRef<"select">;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { "aria-describedby": describedBy, "aria-invalid": invalid, className, id, ...props },
  ref,
) {
  const field = useContext(FieldContext);
  return (
    <select
      {...props}
      ref={ref}
      id={id ?? field?.controlId}
      className={classes(controlClasses, "tw:cursor-pointer", className)}
      aria-describedby={describedByIds(describedBy, field)}
      aria-invalid={field?.invalid ? true : invalid}
    />
  );
});

const controlClasses =
  "tw:h-field tw:w-full tw:rounded-control tw:border tw:border-solid tw:border-border tw:bg-surface tw:px-3 tw:font-ui tw:text-body tw:text-foreground tw:transition-colors tw:duration-fast tw:placeholder:text-subtle tw:focus:border-accent tw:focus:outline-none tw:focus:shadow-focus tw:disabled:cursor-not-allowed tw:disabled:bg-control tw:disabled:text-muted tw:disabled:opacity-50 tw:aria-invalid:border-danger tw:aria-invalid:bg-danger-surface";

function describedByIds(explicit: string | undefined, field: FieldContextValue | null): string | undefined {
  const ids = [explicit, field?.descriptionId, field?.errorId].filter(Boolean);
  return ids.length === 0 ? undefined : ids.join(" ");
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
