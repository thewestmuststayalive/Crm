// Fælles klasser, som både server- og klientkomponenter kan bruge (fx på <Link>).

export const buttonVariants = {
  primary: "bg-brand-700 text-white shadow-sm hover:bg-brand-800",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export type ButtonVariant = keyof typeof buttonVariants;

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
    buttonVariants[variant],
    className,
  );
}
