import { LucideIcon } from "lucide-react";

export default function StatCard({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center">
          <Icon size={17} />
        </div>
        {trend && (
          <span className={`text-[11px] font-medium ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
            {trend.positive ? "↗" : "↘"} {trend.value}
          </span>
        )}
      </div>
      <p className="text-lg font-bold text-neutral-900 dark:text-neutral-50">{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}
