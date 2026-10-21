import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ApiError } from "../lib/api";

// Small accessible building blocks: every field has a visible label, hints and errors are tied to it.

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}

function describedBy(id: string, hint: unknown, error: unknown) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function TextField({ label, hint, error, id, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy(inputId, hint, error)} {...input} />
      {hint && (
        <span id={`${inputId}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextArea({ label, hint, error, id, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <textarea id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy(inputId, hint, error)} {...input} />
      {hint && (
        <span id={`${inputId}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({ label, hint, error, id, children, ...select }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <select id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy(inputId, hint, error)} {...select}>
        {children}
      </select>
      {hint && (
        <span id={`${inputId}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

/** A failed request or command, said plainly. Validation errors shown at their fields are left out. */
export function ErrorMessage({ error, fields = [] }: { error: unknown; fields?: string[] }) {
  if (!error) return null;
  if (error instanceof ApiError && fields.some((f) => error.field(f))) return null;
  const message =
    error instanceof ApiError
      ? error.status === 401
        ? "Please sign in again."
        : error.status === 403
          ? (error.problem.detail ?? "You are not allowed to do that.")
          : error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
  return (
    <p className="alert alert-error" role="alert">
      {message}
    </p>
  );
}

/** The message for one field from a failed command. */
export function fieldError(error: unknown, name: string): string | undefined {
  return error instanceof ApiError ? error.field(name) : undefined;
}

// Icons: decorative unless labelled by their button.
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function HeartIcon({ filled = false, size = 20 }: { filled?: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export function UserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function PhotoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={1.6}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 8" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
