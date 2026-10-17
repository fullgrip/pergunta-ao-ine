"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Territory } from "../../lib/ine/types";
import { getMunicipalityById, searchMunicipalities } from "../../lib/municipalities";
import styles from "./MunicipalitySelector.module.css";

export const MUNICIPALITY_STORAGE_KEY = "pergunta-ao-ine:municipality";

export function readSavedMunicipalityId(): string | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(MUNICIPALITY_STORAGE_KEY);
  return saved && getMunicipalityById(saved) ? saved : null;
}

export function saveSelectedMunicipalityId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id && getMunicipalityById(id)) window.localStorage.setItem(MUNICIPALITY_STORAGE_KEY, id);
  else window.localStorage.removeItem(MUNICIPALITY_STORAGE_KEY);
}

/** State shared across pages via localStorage; explicit municipality names in questions take precedence in the caller. */
export function useSelectedMunicipality(initialId: string | null = null): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(initialId);
  useEffect(() => {
    if (initialId && getMunicipalityById(initialId)) {
      setId(initialId);
      saveSelectedMunicipalityId(initialId);
    } else {
      setId(readSavedMunicipalityId());
    }
  }, [initialId]);
  function select(nextId: string | null) {
    setId(nextId);
    saveSelectedMunicipalityId(nextId);
  }
  return [id, select];
}

export interface MunicipalitySelectorProps {
  value?: string | null;
  onChange: (municipality: Territory) => void;
  excludedIds?: string[];
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export function MunicipalitySelector({
  value,
  onChange,
  excludedIds = [],
  placeholder = "Pesquisar município",
  label,
  id,
  className,
  disabled = false,
}: MunicipalitySelectorProps) {
  const generatedId = useId();
  const inputId = id ?? `municipality-${generatedId}`;
  const listId = `${inputId}-suggestions`;
  const [internalId, setInternalId] = useSelectedMunicipality();
  const selectedId = value === undefined ? internalId : value;
  const selected = selectedId ? getMunicipalityById(selectedId) : undefined;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const excluded = useMemo(() => new Set(excludedIds.map((entry) => entry.toUpperCase())), [excludedIds]);
  const suggestions = useMemo(() => searchMunicipalities(query, 308).filter((entry) => !excluded.has(entry.id)).slice(0, 10), [query, excluded]);

  useEffect(() => { if (!open) setQuery(selected?.name ?? ""); }, [selected?.name, open]);

  function choose(municipality: Territory) {
    setQuery(municipality.name);
    setOpen(false);
    setActive(0);
    if (value === undefined) setInternalId(municipality.id);
    else saveSelectedMunicipalityId(municipality.id);
    onChange(municipality);
  }

  return (
    <div className={`${styles.selector} ${className ?? ""}`}>
      {label && <label className={styles.label} htmlFor={inputId}>{label}</label>}
      <div className={styles.inputWrap}>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-label={label ?? "Município"}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && suggestions[active] ? `${listId}-${suggestions[active].id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={(event) => { event.target.select(); setOpen(true); }}
          onBlur={() => { window.setTimeout(() => setOpen(false), 120); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); setQuery(selected?.name ?? ""); }
            else if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, suggestions.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
            else if (event.key === "Enter" && open && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); }
          }}
        />
        <span className={styles.icon} aria-hidden="true">⌕</span>
      </div>
      {open && <div className={styles.popup}>
        <ul id={listId} role="listbox" className={styles.list}>
          {suggestions.map((municipality, index) => (
            <li key={municipality.id} id={`${listId}-${municipality.id}`} role="option" aria-selected={index === active}>
              <button type="button" className={index === active ? styles.active : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(municipality)}>
                <span>{municipality.name}</span><small>{municipality.region} · {municipality.id}</small>
              </button>
            </li>
          ))}
          {!suggestions.length && <li className={styles.empty}>Nenhum município encontrado.</li>}
        </ul>
      </div>}
    </div>
  );
}

export default MunicipalitySelector;
