"use client";

import { useEffect, useState } from "react";
import { PROJECT_CONTACT_ROLE_LABELS, type ProjectContactRole } from "@/lib/constants";

type ContactView = {
  id: string;
  roleLabel: string;
  name: string;
  phone: string;
  email: string;
};

type Props = {
  projectId: string;
  refreshKey?: number;
  showEdit?: boolean;
  defaultCollapsed?: boolean;
  onEdit: () => void;
};

function roleLabel(role: string) {
  return PROJECT_CONTACT_ROLE_LABELS[role as ProjectContactRole] ?? role;
}

export default function ProjectContactsBar({ projectId, refreshKey = 0, showEdit = true, defaultCollapsed = false, onEdit }: Props) {
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!projectId) {
      setContacts([]);
      return;
    }
    void fetch(`/api/projects/${projectId}/contacts`)
      .then((response) => response.json())
      .then((payload: {
        contacts?: Array<{
          id: string;
          role: string;
          contacts: { name: string; phone: string; email: string } | null;
          profiles: { display_name: string; email: string; phone: string } | null;
        }>;
      }) => {
        const next = (payload.contacts ?? [])
          .map((item) => {
            const linked = item.profiles;
            const contact = item.contacts;
            const name = linked?.display_name?.trim() || contact?.name?.trim() || "";
            if (!name) return null;
            return {
              id: item.id,
              roleLabel: roleLabel(item.role),
              name,
              phone: linked?.phone?.trim() || contact?.phone?.trim() || "",
              email: linked?.email?.trim() || contact?.email?.trim() || "",
            };
          })
          .filter(Boolean) as ContactView[];
        setContacts(next);
      })
      .catch(() => setContacts([]));
  }, [projectId, refreshKey]);

  if (!projectId || !contacts.length) return null;

  return (
    <section className="project-contacts-bar" aria-label="Projekto kontaktai">
      <div className="project-contacts-bar-head">
        <button type="button" className="project-contacts-bar-toggle" onClick={() => setCollapsed((value) => !value)}>
          <strong>Projekto kontaktai</strong>
          <span>{collapsed ? "Rodyti" : "Slėpti"} · {contacts.length}</span>
        </button>
        {showEdit ? <button type="button" className="secondary-button project-contacts-bar-edit" onClick={onEdit}>Redaguoti</button> : null}
      </div>
      {!collapsed ? (
        <div className="project-contacts-bar-grid">
          {contacts.map((contact) => (
            <article key={contact.id} className="project-contacts-bar-card">
              <span className="project-contacts-bar-role">{contact.roleLabel}</span>
              <strong>{contact.name}</strong>
              <div className="project-contacts-bar-links">
                {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a> : null}
                {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
                {!contact.phone && !contact.email ? <span className="muted">Kontaktai neįrašyti</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
