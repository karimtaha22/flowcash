// Small reusable on/off pill toggle — used across the التذكيرات feature
// (general reminder "تذكير؟", medication "ذكرني", appointment/medication
// active states) since nothing like it existed elsewhere in the app yet.
export default function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-orange-500" : "bg-neutral-300 dark:bg-neutral-700"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform ${checked ? "-translate-x-[22px]" : "-translate-x-0.5"}`} />
    </button>
  );
}
