"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx, type ButtonVariant } from "./styles";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

/** Submit-knap der beder om bekræftelse før en handling, der ikke kan fortrydes. */
export function ConfirmButton({
  message,
  children,
  variant = "danger",
  ...props
}: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      variant={variant}
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        className,
      )}
    />
  );
}

/** Knap der automatisk viser "Gemmer…" mens formularen sendes. */
export function SubmitButton({
  children,
  pendingText = "Gemmer…",
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cx(
        "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-500",
        className,
      )}
    />
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

export function FormMessage({ state }: { state: { error?: string; success?: string } }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {state.success}
      </p>
    );
  }
  return null;
}

export function Card({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
