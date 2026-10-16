import { ChevronDown, Info, X } from "lucide-react";
import { WEEK_DAYS, type DaySchedule, type WeekDay } from "../../../models/autoReply.model";
import { DAY_LABEL, timeZoneLabel, timeZoneOptions, type DayIssue } from "../../../utils/autoReplyForm";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { FieldError, ReplyTextField } from "./ReplyTextField";
import { Switch } from "./Switch";

/** Fuera de horario: el texto a la izquierda y la semana a la derecha (en el teléfono, uno debajo del otro). */
export const OutOfHoursStep = ({ editor }: { editor: AutoReplyEditor }) => {
    const { outOfHours } = editor.form;
    const show = editor.showIssues;
    return (
        <div className="grid gap-7 @min-[720px]:grid-cols-[minmax(0,1fr)_470px] items-start">
            <div className="grid gap-2 min-w-0">
                <ReplyTextField
                    label="Mensaje fuera de horario"
                    value={outOfHours.text}
                    onChange={(text) => editor.setOutOfHours({ text })}
                    error={show ? editor.issues.outOfHoursText : undefined}
                    placeholder="Ahora estamos cerrados. Atendemos de…"
                    minHeight="min-h-[170px]"
                />
                <div className="mt-1.5 flex gap-2.5 items-start px-3.5 py-3 rounded-[10px] bg-brand-bg text-[13px] leading-[1.55] text-brand-gray-600">
                    <Info size={15} className="flex-none mt-0.5 text-brand-muted" />
                    <span>
                        Sale <b className="font-semibold text-brand-text">una vez por cierre</b>: quien escribe el viernes a las 19:00
                        y otra vez el sábado a las 7:00 la recibe una sola vez.
                    </span>
                </div>
            </div>

            <div className="grid gap-2 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[13.5px] font-semibold text-brand-strong">Horario de atención</span>
                    <button type="button" onClick={editor.copyMondayToAll}
                        className="text-[12.5px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                        Copiar el lunes a todos
                    </button>
                    <TimeZoneSelect value={editor.form.timezone} onChange={editor.setTimezone} />
                </div>
                <div className={`border rounded-[10px] overflow-hidden divide-y divide-brand-raised
                    ${show && editor.issues.schedule ? 'border-brand-danger-border' : 'border-brand-border'}`}>
                    {WEEK_DAYS.map(day => (
                        <DayRow
                            key={day}
                            day={day}
                            schedule={outOfHours.schedule[day]}
                            issue={show ? editor.issues.days[day] : undefined}
                            onChange={(schedule) => editor.setDay(day, schedule)}
                        />
                    ))}
                </div>
                {show && editor.issues.schedule && <FieldError>{editor.issues.schedule}</FieldError>}
            </div>
        </div>
    );
};

/** La zona horaria, discreta: un desplegable nativo con el aspecto de un enlace. */
const TimeZoneSelect = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <label className="relative ml-auto inline-flex items-center gap-1 text-[12.5px] text-brand-muted hover:text-brand-text cursor-pointer">
        <span>{timeZoneLabel(value)}</span>
        <ChevronDown size={12} />
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Zona horaria"
            className="absolute inset-0 opacity-0 cursor-pointer"
        >
            {timeZoneOptions(value).map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
        </select>
    </label>
);

const DEFAULT_RANGES = [{ start: '08:00', end: '18:00' }];
const SECOND_RANGE = { start: '14:30', end: '18:00' };

const DayRow = ({ day, schedule, issue, onChange }: {
    day: WeekDay;
    schedule: DaySchedule;
    issue?: DayIssue;
    onChange: (schedule: DaySchedule) => void;
}) => {
    const open = !schedule.closed;
    const setRange = (index: number, field: 'start' | 'end', value: string) => onChange({
        ...schedule,
        ranges: schedule.ranges.map((range, i) => (i === index ? { ...range, [field]: value } : range)),
    });

    return (
        <div className={`px-3 py-2 min-h-12 grid grid-cols-[34px_28px_minmax(0,1fr)] gap-x-2.5 gap-y-1 items-center
            ${issue ? 'bg-brand-danger-soft' : 'bg-brand-surface'}`}>
            <span className={`text-[13.5px] font-semibold ${open ? 'text-brand-text' : 'text-brand-muted'}`}>{DAY_LABEL[day]}</span>
            <Switch
                size="sm"
                checked={open}
                label={`Abierto el ${DAY_LABEL[day]}`}
                onChange={(next) => onChange(next
                    ? { closed: false, ranges: schedule.ranges.length ? schedule.ranges : DEFAULT_RANGES.map(r => ({ ...r })) }
                    : { closed: true, ranges: [] })}
            />
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {!open && <span className="text-[13.5px] text-brand-subtle">Cerrado</span>}
                {open && schedule.ranges.map((range, index) => (
                    <span key={index} className="contents">
                        {index > 0 && <span className="text-[12.5px] text-brand-subtle px-[3px]">y</span>}
                        <span className="inline-flex items-center gap-1.5">
                            <TimeInput
                                field="start"
                                value={range.start}
                                label={`${DAY_LABEL[day]}, tramo ${index + 1}, desde`}
                                invalid={issue?.rangeIndex === index && issue.field === 'start'}
                                onChange={(value) => setRange(index, 'start', value)}
                            />
                            <span className="text-xs text-brand-subtle">–</span>
                            <TimeInput
                                field="end"
                                value={range.end}
                                label={`${DAY_LABEL[day]}, tramo ${index + 1}, hasta`}
                                invalid={issue?.rangeIndex === index && issue.field === 'end'}
                                onChange={(value) => setRange(index, 'end', value)}
                            />
                        </span>
                        {index > 0 && (
                            <button type="button" title="Quitar el segundo tramo" aria-label="Quitar el segundo tramo"
                                onClick={() => onChange({ ...schedule, ranges: schedule.ranges.slice(0, 1) })}
                                className="flex p-[3px] text-brand-subtle hover:text-brand-text cursor-pointer">
                                <X size={12} strokeWidth={2.4} />
                            </button>
                        )}
                    </span>
                ))}
                {open && schedule.ranges.length === 1 && (
                    <button type="button"
                        onClick={() => onChange({ ...schedule, ranges: [...schedule.ranges, { ...SECOND_RANGE }] })}
                        className="px-1 text-[12.5px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                        + Segundo tramo
                    </button>
                )}
            </div>
            {issue && <div className="col-start-3"><FieldError>{issue.message}</FieldError></div>}
        </div>
    );
};

// Las horas en pasos de 15 minutos, en formato de 24 h (el `<input type="time">`
// sale en 12 h según el idioma del navegador y no cabe en la fila).
const QUARTERS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const timeOptions = (value: string, field: 'start' | 'end') => {
    const options = field === 'end' ? [...QUARTERS.slice(1), '24:00'] : QUARTERS;
    // Una hora guardada que no cae en un cuarto (p. ej. 13:10) se conserva.
    return options.includes(value) || !value ? options : [...options, value].sort();
};

const TimeInput = ({ value, field, label, invalid, onChange }: {
    value: string;
    field: 'start' | 'end';
    label: string;
    invalid: boolean;
    onChange: (value: string) => void;
}) => (
    <select
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`h-[30px] px-2 rounded-[7px] border appearance-none cursor-pointer font-mono tabular-nums text-[12.5px] text-brand-text
            focus:outline-none focus:ring-[3px] transition-colors
            ${invalid
                ? 'border-brand-danger bg-brand-danger-soft focus:ring-brand-danger-border'
                : 'border-brand-border-strong bg-brand-surface hover:border-brand-gray-400 focus:border-brand-success focus:ring-brand-accent-soft'}`}
    >
        {timeOptions(value, field).map(time => <option key={time} value={time}>{time}</option>)}
    </select>
);
