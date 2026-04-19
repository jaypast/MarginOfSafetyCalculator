import { AlertTriangle, Info, Calendar } from 'lucide-react';
import { getEarningsCalendarInfo, MonthClassification } from '@/lib/earningsCalendar';

const CONFIG: Record<MonthClassification, {
  bg: string;
  border: string;
  textColor: string;
  labelColor: string;
  icon: React.ReactNode;
}> = {
  newsy: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    textColor: 'text-blue-800',
    labelColor: 'text-blue-700',
    icon: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
  },
  repetitive: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    textColor: 'text-amber-900',
    labelColor: 'text-amber-700',
    icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
  },
  quiet: {
    bg: 'bg-neutral-50',
    border: 'border-neutral-200',
    textColor: 'text-neutral-700',
    labelColor: 'text-neutral-500',
    icon: <Calendar className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />,
  },
};

const EntryTimingBanner: React.FC = () => {
  const info = getEarningsCalendarInfo();
  const style = CONFIG[info.classification];

  return (
    <div className={`${style.bg} ${style.border} border rounded-lg px-3 py-2.5 flex gap-2.5`}>
      {style.icon}
      <div>
        <span className={`text-xs font-semibold uppercase tracking-wide ${style.labelColor}`}>
          {info.quarterContext} &middot; {info.label}
        </span>
        <p className={`text-xs mt-0.5 ${style.textColor}`}>{info.explanation}</p>
      </div>
    </div>
  );
};

export default EntryTimingBanner;
