import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { AuthField } from '../Auth/AuthField';
import { isPositional, buttonFieldLabel } from '../../utils/templatePlaceholders';
import type { TemplateForm } from '../../hooks/useTemplateForm';

/** Categoría de Meta (MARKETING, UTILITY, AUTHENTICATION): píldora neutra. */
const CategoryPill = ({ category }: { category?: string }) => category ? (
  <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em]
    bg-brand-raised text-brand-muted flex-none">
    {category}
  </span>
) : null;

/**
 * Selector de plantilla aprobada. Listbox en vez de <select> para poder
 * enseñar, junto al nombre, el idioma y la categoría — dos plantillas pueden
 * llamarse parecido y distinguirse solo por eso.
 */
export const TemplatePicker = ({ form }: { form: TemplateForm }) => (
  <div className="grid gap-[7px]">
    <span className="flex items-baseline text-[13px] font-semibold text-brand-strong">
      Plantilla
      <span className="ml-auto text-xs font-normal text-brand-muted">Solo aparecen las aprobadas</span>
    </span>

    <Listbox value={form.selected?.name ?? ''} onChange={form.selectTemplate}>
      <ListboxButton className="group w-full flex items-center gap-2.5 text-left cursor-pointer
        bg-brand-surface border border-brand-border-strong rounded-[8px] px-[14px] py-[11px]
        focus:outline-none data-[open]:border-brand-success data-[open]:ring-[3px] data-[open]:ring-brand-accent-soft
        transition-colors">
        {form.selected ? (
          <>
            <span className="font-mono text-sm text-brand-text truncate">{form.selected.name}</span>
            <span className="font-mono text-[11px] text-brand-subtle flex-none">{form.selected.language}</span>
            <CategoryPill category={form.selected.category} />
          </>
        ) : (
          <span className="text-[15px] text-brand-subtle">Elige una plantilla…</span>
        )}
        <ChevronDown size={16} className="ml-auto flex-none text-brand-muted transition-transform
          group-data-[open]:rotate-180" />
      </ListboxButton>

      <ListboxOptions
        anchor={{ to: 'bottom start', gap: 6 }}
        className="z-50 w-[var(--button-width)] max-h-72 overflow-y-auto p-1.5
          bg-brand-surface border border-brand-border rounded-xl
          shadow-[0_18px_40px_rgba(14,17,22,0.12)] focus:outline-none"
      >
        {form.approved.map(t => (
          <ListboxOption
            key={t.templateId}
            value={t.name}
            className="group flex items-start gap-2.5 px-3 py-2.5 rounded-[8px] cursor-pointer
              data-[focus]:bg-brand-bg"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-brand-text truncate">{t.name}</span>
                <span className="font-mono text-[11px] text-brand-subtle flex-none">{t.language}</span>
                <CategoryPill category={t.category} />
              </div>
              {t.bodyText && (
                <p className="text-[13px] text-brand-muted truncate mt-0.5">{t.bodyText}</p>
              )}
            </div>
            <Check size={16} className="mt-0.5 flex-none text-brand-accent-strong invisible
              group-data-[selected]:visible" />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  </div>
);

/** Un campo por marcador del cuerpo y por botón que pide valor. */
export const TemplateFields = ({ form }: { form: TemplateForm }) => {
  if (form.placeholders.length === 0 && form.buttonFields.length === 0) return null;

  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3.5">
      {form.placeholders.map((p, i) => (
        <AuthField
          key={p}
          label={isPositional(form.placeholders) ? `Valor ${i + 1} — {{${p}}}` : p}
          value={form.values[p] ?? ''}
          onChange={(e) => form.setValues(v => ({ ...v, [p]: e.target.value }))}
          required
        />
      ))}

      {form.buttonFields.map(({ button, index }) => (
        <AuthField
          key={`button-${index}`}
          label={buttonFieldLabel(button)}
          value={form.buttonValues[index] ?? ''}
          onChange={(e) => form.setButtonValues(v => ({ ...v, [index]: e.target.value }))}
          mono
          hint={button.type === 'OTP'
            ? 'Tiene que ser el mismo código que aparece en el texto del mensaje.'
            : undefined}
          required
        />
      ))}
    </div>
  );
};
