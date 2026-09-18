"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PhoneInput from "./phone-input";
import { PROJECT_CONTACT_ROLE_LABELS, projectStatuses, type ProjectContactRole, type ProjectStatus } from "@/lib/constants";

type Project = {
  id: string;
  name: string;
  address: string;
  status?: ProjectStatus;
};

type StructuredContact = {
  role: ProjectContactRole;
  profileId: string;
  name: string;
  phone: string;
  email: string;
  contactId?: string;
  notifyEmail: boolean;
  manual: boolean;
};

type OtherContact = {
  role: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  workScope: string;
  contactId?: string;
};

type StaffUser = { id: string; display_name: string; email: string; phone?: string };

type CurrentUser = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
};

const STRUCTURED_ROLES: ProjectContactRole[] = ["project_manager", "coordinator", "works_manager"];

type Props = {
  project: Project;
  saving: boolean;
  currentUser: CurrentUser;
  onClose: () => void;
  onOpenProfile: () => void;
  onSave: (payload: {
    name: string;
    address: string;
    status: ProjectStatus;
    contacts: Array<{
      role: string;
      name: string;
      phone: string;
      email: string;
      category: string;
      workScope: string;
      contactId?: string;
      profileId?: string;
      notifyEmail?: boolean;
    }>;
  }) => Promise<void>;
  onDelete: () => void;
};

function blankStructured(role: ProjectContactRole): StructuredContact {
  return {
    role,
    profileId: "",
    name: "",
    phone: "",
    email: "",
    notifyEmail: role !== "works_manager",
    manual: true,
  };
}

function blankOther(): OtherContact {
  return { role: "", name: "", phone: "", email: "", category: "", workScope: "" };
}

function staffSnapshot(user: StaffUser | CurrentUser, currentUser: CurrentUser) {
  const id = user.id;
  const name = "display_name" in user ? user.display_name : user.displayName;
  const email = user.email || (id === currentUser.id ? currentUser.email : "");
  let phone = user.phone?.trim() ?? "";
  if (!phone && id === currentUser.id) phone = currentUser.phone?.trim() ?? "";
  return {
    profileId: id,
    name: name || (id === currentUser.id ? currentUser.displayName : "") || email,
    phone,
    email,
    manual: false,
  };
}

export default function ProjectEdit({ project, saving, currentUser, onClose, onOpenProfile, onSave, onDelete }: Props) {
  const [name, setName] = useState(project.name);
  const [address, setAddress] = useState(project.address ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status ?? "Vykdomas");
  const [structured, setStructured] = useState<StructuredContact[]>(STRUCTURED_ROLES.map(blankStructured));
  const [others, setOthers] = useState<OtherContact[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, StaffUser>();
    if (currentUser.id) {
      map.set(currentUser.id, {
        id: currentUser.id,
        display_name: currentUser.displayName || currentUser.email,
        email: currentUser.email,
        phone: currentUser.phone,
      });
    }
    for (const user of staffUsers) {
      const existing = map.get(user.id);
      map.set(user.id, {
        id: user.id,
        display_name: user.display_name || existing?.display_name || "",
        email: user.email || existing?.email || "",
        phone: user.phone?.trim() || existing?.phone?.trim() || "",
      });
    }
    return [...map.values()];
  }, [currentUser, staffUsers]);

  useEffect(() => {
    if (!currentUser.phone?.trim()) return;
    setStructured((items) => items.map((item) => (
      item.profileId === currentUser.id && !item.phone.trim()
        ? { ...item, phone: currentUser.phone.trim() }
        : item
    )));
  }, [currentUser.id, currentUser.phone]);

  useEffect(() => {
    setStructured((items) => {
      let changed = false;
      const next = items.map((item) => {
        if (!item.profileId || item.phone.trim()) return item;
        const user = staffOptions.find((entry) => entry.id === item.profileId);
        const phone = user?.phone?.trim() ?? "";
        if (!phone) return item;
        changed = true;
        return { ...item, phone };
      });
      return changed ? next : items;
    });
  }, [staffOptions]);

  useEffect(() => {
    setName(project.name);
    setAddress(project.address ?? "");
    setStatus(project.status ?? "Vykdomas");
    void fetch("/api/staff").then((response) => response.json()).then((payload: { users?: StaffUser[] }) => setStaffUsers(payload.users ?? [])).catch(() => setStaffUsers([]));
    void fetch(`/api/projects/${project.id}/contacts`)
      .then((response) => response.json())
      .then((payload: {
        contacts?: Array<{
          role: string;
          category: string;
          work_scope: string;
          notify_email: boolean;
          profile_id: string | null;
          contacts: { id: string; name: string; phone: string; email: string } | null;
          profiles: { id: string; display_name: string; email: string; phone: string } | null;
        }>;
      }) => {
        const nextStructured = STRUCTURED_ROLES.map(blankStructured);
        const nextOthers: OtherContact[] = [];
        for (const item of payload.contacts ?? []) {
          const contact = item.contacts;
          const linked = item.profiles;
          const row = {
            role: item.role,
            name: linked?.display_name || contact?.name || "",
            phone: linked?.phone || contact?.phone || "",
            email: linked?.email || contact?.email || "",
            category: item.category ?? "",
            workScope: item.work_scope ?? "",
            contactId: contact?.id,
            profileId: item.profile_id ?? linked?.id ?? "",
            notifyEmail: item.notify_email,
          };
          const structuredIndex = STRUCTURED_ROLES.indexOf(item.role as ProjectContactRole);
          if (structuredIndex >= 0) {
            nextStructured[structuredIndex] = {
              role: item.role as ProjectContactRole,
              profileId: row.profileId,
              name: row.name,
              phone: row.phone,
              email: row.email,
              contactId: row.contactId,
              notifyEmail: row.notifyEmail,
              manual: !row.profileId,
            };
          } else if (row.name.trim()) {
            nextOthers.push({
              role: PROJECT_CONTACT_ROLE_LABELS[item.role as ProjectContactRole] ?? item.role,
              name: row.name,
              phone: row.phone,
              email: row.email,
              category: row.category,
              workScope: row.workScope,
              contactId: row.contactId,
            });
          }
        }
        setStructured(nextStructured);
        setOthers(nextOthers);
      })
      .catch(() => {
        setStructured(STRUCTURED_ROLES.map(blankStructured));
        setOthers([]);
      });
  }, [project.id, project.name, project.address, project.status]);

  function updateStructured(index: number, patch: Partial<StructuredContact>) {
    setStructured((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function assignStaff(index: number, userId: string) {
    if (!userId) {
      updateStructured(index, { profileId: "", manual: true });
      return;
    }
    const user = staffOptions.find((item) => item.id === userId);
    if (!user) return;
    updateStructured(index, { ...staffSnapshot(user, currentUser), contactId: undefined });
  }

  function assignSelf(index: number) {
    if (!currentUser.id) return;
    updateStructured(index, { ...staffSnapshot(currentUser, currentUser), contactId: undefined });
  }

  function switchToManual(index: number) {
    updateStructured(index, { profileId: "", manual: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const structuredContacts = structured
      .filter((item) => item.name.trim() || item.profileId)
      .map((item) => ({
        role: item.role,
        name: item.name.trim(),
        phone: item.phone.trim(),
        email: item.email.trim(),
        category: "",
        workScope: "",
        contactId: item.contactId,
        profileId: item.profileId || undefined,
        notifyEmail: item.notifyEmail,
      }));
    const otherContacts = others
      .filter((item) => item.name.trim() && item.role.trim())
      .map((item) => ({ ...item, role: item.role.trim() }));
    await onSave({
      name: name.trim(),
      address: address.trim(),
      status,
      contacts: [...structuredContacts, ...otherContacts],
    });
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
          <label><span>Adresas</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Objekto adresas" /></label>
          <label><span>Būsena</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
              {projectStatuses.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="profile-settings-inline">
          <div>
            <strong>Mano kontaktai</strong>
            <p>{currentUser.displayName || currentUser.email}{currentUser.phone ? ` · ${currentUser.phone}` : ""}</p>
          </div>
          <button type="button" className="secondary-button" onClick={onOpenProfile}>Redaguoti paskyrą</button>
        </div>

        <section className="project-contacts-block">
          <div className="project-contacts-head">
            <div>
              <strong>Projekto komanda</strong>
              <p>Pasirinkite kolegą iš sąrašo arba įveskite kontaktą ranka. „Priskirti save“ užpildo iš jūsų paskyros.</p>
            </div>
          </div>
          {structured.map((contact, index) => (
            <article key={contact.role} className="project-contact-card">
              <div className="project-contact-head">
                <strong>{PROJECT_CONTACT_ROLE_LABELS[contact.role]}</strong>
                {contact.profileId ? <span className="project-contact-badge">Priskirtas kolega</span> : null}
              </div>

              <div className="project-contact-picker">
                <label><span>Pasirinkti kolegą</span>
                  <select value={contact.profileId} onChange={(event) => assignStaff(index, event.target.value)}>
                    <option value="">— Įvesti ranka —</option>
                    {staffOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.id === currentUser.id ? `★ Aš · ${user.display_name}` : user.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="project-contact-quick">
                  <button type="button" className="secondary-button" onClick={() => assignSelf(index)} disabled={!currentUser.id}>
                    Priskirti save
                  </button>
                  {contact.profileId ? (
                    <button type="button" className="secondary-button" onClick={() => switchToManual(index)}>
                      Keisti ranka
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="project-contact-fields">
                <label><span>Vardas / įmonė</span><input value={contact.name} onChange={(event) => updateStructured(index, { name: event.target.value, profileId: "", manual: true })} placeholder="Vardas arba įmonė" /></label>
                <div className="project-contact-links">
                  <label><span>Telefonas</span><PhoneInput value={contact.phone} onChange={(value) => updateStructured(index, { phone: value, profileId: "", manual: true })} /></label>
                  <label><span>El. paštas</span><input type="email" value={contact.email} onChange={(event) => updateStructured(index, { email: event.target.value, profileId: "", manual: true })} placeholder="vardas@imone.lt" /></label>
                </div>
              </div>

              {(contact.phone || contact.email) ? (
                <div className="project-contact-actions">
                  <span className="project-contact-actions-label">Greiti veiksmai</span>
                  <div className="project-contact-tap-links">
                    {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>Skambinti</a> : null}
                    {contact.email ? <a href={`mailto:${contact.email}`}>Rašyti el. laišką</a> : null}
                  </div>
                </div>
              ) : null}

              {contact.role !== "works_manager" ? (
                <label className="project-contact-notify">
                  <input
                    type="checkbox"
                    checked={contact.notifyEmail}
                    onChange={(event) => updateStructured(index, { notifyEmail: event.target.checked })}
                  />
                  <span>Siųsti dienos suvestinę el. paštu</span>
                </label>
              ) : null}
            </article>
          ))}
        </section>

        <section className="project-contacts-block">
          <div className="project-contacts-head">
            <div><strong>Kiti kontaktai</strong><p>Pvz. tiekėjas, montuotojas, kliento atstovas.</p></div>
            <button type="button" className="secondary-button" onClick={() => setOthers((items) => [...items, blankOther()])}>＋ Pridėti</button>
          </div>
          {others.map((contact, index) => (
            <article key={`other-${index}`} className="project-contact-card">
              <label><span>Rolė</span><input value={contact.role} onChange={(event) => setOthers((items) => items.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} placeholder="Pvz., Montuotojas" /></label>
              <label><span>Vardas</span><input value={contact.name} onChange={(event) => setOthers((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder="Vardas arba įmonė" /></label>
              <div className="project-contact-links">
                <label><span>Telefonas</span><PhoneInput value={contact.phone} onChange={(value) => setOthers((items) => items.map((item, i) => i === index ? { ...item, phone: value } : item))} /></label>
                <label><span>El. paštas</span><input type="email" value={contact.email} onChange={(event) => setOthers((items) => items.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} placeholder="vardas@imone.lt" /></label>
              </div>
              {(contact.phone || contact.email) && (
                <div className="project-contact-tap-links">
                  {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>Skambinti</a> : null}
                  {contact.email ? <a href={`mailto:${contact.email}`}>Rašyti el. laišką</a> : null}
                </div>
              )}
              <button type="button" className="project-contact-remove wide" onClick={() => setOthers((items) => items.filter((_, i) => i !== index))}>Pašalinti kontaktą</button>
            </article>
          ))}
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
