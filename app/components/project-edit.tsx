"use client";

import { FormEvent, useEffect, useState } from "react";
import { PROJECT_CONTACT_ROLE_LABELS, projectStatuses, type ProjectStatus } from "@/lib/constants";

type Project = {
  id: string;
  name: string;
  address: string;
  status?: ProjectStatus;
};

type ContactRow = {
  role: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  workScope: string;
  contactId?: string;
};

const ROLE_SUGGESTIONS = Object.entries(PROJECT_CONTACT_ROLE_LABELS).map(([value, label]) => ({ value, label }));

function roleLabel(role: string) {
  return PROJECT_CONTACT_ROLE_LABELS[role as keyof typeof PROJECT_CONTACT_ROLE_LABELS] ?? role;
}

function filteredRoleSuggestions(query: string) {
  const term = query.trim().toLocaleLowerCase("lt");
  if (!term) return ROLE_SUGGESTIONS;
  return ROLE_SUGGESTIONS.filter((item) => item.label.toLocaleLowerCase("lt").includes(term));
}

function blankContact(): ContactRow {
  return { role: "", name: "", phone: "", email: "", category: "", workScope: "" };
}

type Props = {
  project: Project;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; address: string; status: ProjectStatus; contacts: ContactRow[] }) => Promise<void>;
  onDelete: () => void;
};

export default function ProjectEdit({ project, saving, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(project.name);
  const [address, setAddress] = useState(project.address ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status ?? "Vykdomas");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<Array<{ id: string; name: string; phone: string; email: string }>>([]);
  const [activeNameSuggest, setActiveNameSuggest] = useState<number | null>(null);
  const [activeRoleSuggest, setActiveRoleSuggest] = useState<number | null>(null);

  useEffect(() => {
    setName(project.name);
    setAddress(project.address ?? "");
    setStatus(project.status ?? "Vykdomas");
    void fetch(`/api/projects/${project.id}/contacts`)
      .then((response) => response.json())
      .then((payload: { contacts?: Array<{ role: string; category: string; work_scope: string; contacts: { id: string; name: string; phone: string; email: string } | null }> }) => {
        const rows = (payload.contacts ?? [])
          .filter((item) => item.contacts)
          .map((item) => ({
            role: roleLabel(item.role),
            name: item.contacts!.name,
            phone: item.contacts!.phone ?? "",
            email: item.contacts!.email ?? "",
            category: item.category ?? "",
            workScope: item.work_scope ?? "",
            contactId: item.contacts!.id,
          }));
        setContacts(rows);
      })
      .catch(() => setContacts([]));
  }, [project.id, project.name, project.address, project.status]);

  function updateContact(index: number, patch: Partial<ContactRow>) {
    setContacts((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function closeSuggestMenus() {
    setActiveNameSuggest(null);
    setActiveRoleSuggest(null);
    setNameSuggestions([]);
  }

  async function suggestNames(query: string, index: number) {
    setActiveNameSuggest(index);
    setActiveRoleSuggest(null);
    if (query.trim().length < 2) {
      setNameSuggestions([]);
      return;
    }
    const response = await fetch(`/api/contacts?q=${encodeURIComponent(query.trim())}`);
    const payload = await response.json() as { contacts?: Array<{ id: string; name: string; phone: string; email: string }> };
    setNameSuggestions(payload.contacts ?? []);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const savedContacts = contacts
      .filter((item) => item.name.trim() && item.role.trim())
      .map((item) => ({ ...item, role: item.role.trim() }));
    await onSave({ name: name.trim(), address: address.trim(), status, contacts: savedContacts });
  }

  return (
    <div className="modal-layer project-modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
      <button className="modal-scrim" onClick={() => !saving && onClose()} aria-label="Uždaryti" />
      <form className="project-modal project-edit-modal" onSubmit={handleSubmit}>
        <div className="panel-title">
          <div><span>Objektas</span><h2 id="edit-project-title">Redaguoti projektą</h2></div>
          <button type="button" onClick={onClose} aria-label="Uždaryti" disabled={saving}>×</button>
        </div>

        <div className="project-edit-fields">
          <label><span>Projekto pavadinimas *</span><input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
          <label><span>Adresas</span><input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
          <label><span>Būsena</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
              {projectStatuses.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <section className="project-contacts-block">
          <div className="project-contacts-head">
            <div>
              <strong>Kontaktai</strong>
              <p>Pridėkite tik tuos, kurių reikia. Rolę galite pasirinkti iš sąrašo arba įrašyti savo.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setContacts((items) => [...items, blankContact()])}>＋ Pridėti kontaktą</button>
          </div>

          {!contacts.length ? (
            <p className="project-contacts-empty">Kontaktų dar nėra. Paspauskite „Pridėti kontaktą“.</p>
          ) : (
            <>
              <div className="contact-grid-head">
                <span>Rolė</span>
                <span>Vardas / įmonė</span>
                <span>Telefonas</span>
                <span>El. paštas</span>
                <span />
              </div>
              {contacts.map((contact, index) => {
                const roleOptions = filteredRoleSuggestions(contact.role);
                return (
                  <article key={`contact-${index}`} className="project-contact-row">
                    <div className="contact-autocomplete">
                      <input
                        value={contact.role}
                        onFocus={() => {
                          setActiveRoleSuggest(index);
                          setActiveNameSuggest(null);
                          setNameSuggestions([]);
                        }}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setActiveRoleSuggest((current) => (current === index ? null : current));
                          }, 150);
                        }}
                        onChange={(event) => {
                          updateContact(index, { role: event.target.value });
                          setActiveRoleSuggest(index);
                          setActiveNameSuggest(null);
                        }}
                        placeholder="Pvz., Darbų vadovas"
                        autoComplete="off"
                      />
                      {activeRoleSuggest === index && roleOptions.length > 0 && (
                        <div className="contact-suggestions contact-role-suggestions">
                          {roleOptions.map((item) => (
                            <button
                              type="button"
                              key={item.value}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                updateContact(index, { role: item.label });
                                setActiveRoleSuggest(null);
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="contact-autocomplete">
                      <input
                        value={contact.name}
                        onFocus={() => {
                          setActiveNameSuggest(index);
                          setActiveRoleSuggest(null);
                        }}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setActiveNameSuggest((current) => (current === index ? null : current));
                            setNameSuggestions([]);
                          }, 150);
                        }}
                        onChange={(event) => {
                          updateContact(index, { name: event.target.value, contactId: undefined });
                          void suggestNames(event.target.value, index);
                        }}
                        placeholder="Pradėkite rašyti…"
                        autoComplete="off"
                      />
                      {activeNameSuggest === index && nameSuggestions.length > 0 && (
                        <div className="contact-suggestions">
                          {nameSuggestions.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                updateContact(index, { contactId: item.id, name: item.name, phone: item.phone, email: item.email });
                                closeSuggestMenus();
                              }}
                            >
                              <b>{item.name}</b>
                              <small>{[item.phone, item.email].filter(Boolean).join(" · ")}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input value={contact.phone} onChange={(event) => updateContact(index, { phone: event.target.value })} placeholder="+370…" />
                    <input type="email" value={contact.email} onChange={(event) => updateContact(index, { email: event.target.value })} placeholder="vardas@imone.lt" />
                    <button type="button" className="project-contact-remove" onClick={() => setContacts((items) => items.filter((_, i) => i !== index))} aria-label={`Pašalinti ${roleLabel(contact.role) || "kontaktą"}`}>×</button>
                  </article>
                );
              })}
            </>
          )}
        </section>

        <div className="panel-actions project-edit-actions">
          <button type="button" className="danger-button" onClick={onDelete} disabled={saving}>Ištrinti</button>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Atšaukti</button>
          <button type="submit" className="primary-button" disabled={saving || !name.trim()}>{saving ? "Saugoma…" : "Išsaugoti"}</button>
        </div>
      </form>
    </div>
  );
}
