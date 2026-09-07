"use client";

import { FormEvent, useEffect, useState } from "react";
import { EDIT_PERMISSION_KEYS, PERMISSION_KEYS, VIEW_PERMISSION_KEYS, type PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isSuperAdmin: boolean;
  permissions: Record<PermissionKey, boolean>;
};

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  create_records: "Įrašai",
  edit_records: "Redaguoti įrašus",
  delete_records: "Trinti įrašus",
  delete_media: "Trinti nuotraukas",
  manage_projects: "Projektai",
  invite_clients: "Kviesti klientus",
  generate_reports: "Ataskaitos",
  see_internal: "Vidinė informacija",
  manage_users: "Vartotojai",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administratorius",
  staff: "Vidinis darbuotojas",
  contractor: "Montuotojas / tiekėjas",
  client: "Užsakovas",
};

function emptyPermissions(): Partial<Record<PermissionKey, boolean>> {
  return {};
}

function PermissionGrid({
  permissions,
  onChange,
}: {
  permissions: Partial<Record<PermissionKey, boolean>>;
  onChange: (next: Partial<Record<PermissionKey, boolean>>) => void;
}) {
  function toggle(key: PermissionKey, checked: boolean) {
    onChange({ ...permissions, [key]: checked });
  }

  return (
    <table className="admin-permissions-table">
      <thead>
        <tr>
          <th>Teisė</th>
          <th>Gali matyti</th>
          <th>Gali keisti</th>
        </tr>
      </thead>
      <tbody>
        {VIEW_PERMISSION_KEYS.map((key) => (
          <tr key={key}>
            <td>{PERMISSION_LABELS[key]}</td>
            <td className="admin-permission-check">
              <input
                type="checkbox"
                checked={permissions[key] ?? false}
                onChange={(event) => toggle(key, event.target.checked)}
                aria-label={`Matyti: ${PERMISSION_LABELS[key]}`}
              />
            </td>
            <td className="admin-permission-check admin-permission-dash">—</td>
          </tr>
        ))}
        {EDIT_PERMISSION_KEYS.map((key) => (
          <tr key={key}>
            <td>{PERMISSION_LABELS[key]}</td>
            <td className="admin-permission-check admin-permission-dash">—</td>
            <td className="admin-permission-check">
              <input
                type="checkbox"
                checked={permissions[key] ?? false}
                onChange={(event) => toggle(key, event.target.checked)}
                aria-label={`Keisti: ${PERMISSION_LABELS[key]}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [permissions, setPermissions] = useState<Partial<Record<PermissionKey, boolean>>>(emptyPermissions());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("staff");
  const [editPassword, setEditPassword] = useState("");
  const [editPermissions, setEditPermissions] = useState<Partial<Record<PermissionKey, boolean>>>(emptyPermissions());
  const [message, setMessage] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      const payload = await response.json() as { users?: AdminUser[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko užkrauti");
      setUsers(payload.users ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Klaida");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function startEdit(user: AdminUser) {
    setEditingId(user.id);
    setEditDisplayName(user.displayName);
    setEditRole(user.role);
    setEditPassword("");
    const overrides = PERMISSION_KEYS.reduce<Partial<Record<PermissionKey, boolean>>>((acc, key) => {
      acc[key] = user.permissions[key];
      return acc;
    }, {});
    setEditPermissions(overrides);
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPassword("");
    setEditPermissions(emptyPermissions());
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, displayName, role, permissions }),
      });
      const payload = await response.json() as { error?: string; email?: { sent?: boolean } };
      if (!response.ok) throw new Error(payload.error || "Nepavyko sukurti");
      setEmail("");
      setPassword("");
      setDisplayName("");
      setPermissions(emptyPermissions());
      setMessage("Vartotojas sukurtas. Perduokite jam el. paštą ir slaptažodį (be laiškų).");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Klaida");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        id: editingId,
        displayName: editDisplayName,
        role: editRole,
        permissions: editPermissions,
      };
      if (editPassword.trim()) body.password = editPassword.trim();
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko išsaugoti");
      setMessage("Vartotojas atnaujintas");
      cancelEdit();
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Klaida");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-users-page">
      <header className="admin-users-head">
        <div>
          <a href="/">← Grįžti</a>
          <h1>Vartotojų valdymas</h1>
          <p>Kurkite individualius prisijungimus, redaguokite teises ir siųskite kvietimus.</p>
        </div>
      </header>

      <section className="admin-users-create">
        <h2>Naujas vartotojas</h2>
        <form onSubmit={createUser} className="admin-user-form">
          <div className="form-grid">
            <label><span>El. paštas *</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label><span>Laikinas slaptažodis *</span><input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label><span>Vardas</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label><span>Rolė</span>
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="admin-permissions-block">
            <strong>Teisės (nebūtina — naudojami numatytieji pagal rolę)</strong>
            <PermissionGrid permissions={permissions} onChange={setPermissions} />
          </div>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Kuriama…" : "Sukurti ir išsiųsti kvietimą"}</button>
        </form>
      </section>

      {editingId && (
        <section className="admin-users-edit">
          <h2>Redaguoti vartotoją</h2>
          <form onSubmit={saveEdit} className="admin-user-form">
            <div className="form-grid">
              <label><span>Vardas</span><input value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} required /></label>
              <label><span>Rolė</span>
                <select value={editRole} onChange={(event) => setEditRole(event.target.value as UserRole)}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label><span>Naujas slaptažodis</span><input type="password" minLength={6} value={editPassword} onChange={(event) => setEditPassword(event.target.value)} placeholder="Palikite tuščią, jei nekeičiate" /></label>
            </div>
            <div className="admin-permissions-block">
              <strong>Teisės</strong>
              <PermissionGrid permissions={editPermissions} onChange={setEditPermissions} />
            </div>
            <div className="panel-actions">
              <button type="button" className="secondary-button" onClick={cancelEdit} disabled={saving}>Atšaukti</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saugoma…" : "Išsaugoti"}</button>
            </div>
          </form>
        </section>
      )}

      {message ? <p className="admin-message">{message}</p> : null}

      <section className="admin-users-list">
        <h2>Esami vartotojai</h2>
        {loading ? <p>Kraunama…</p> : (
          <table className="admin-data-table">
            <thead><tr><th className="col-name">Vardas</th><th className="col-email">El. paštas</th><th className="col-role">Rolė</th><th>Super admin</th><th className="col-actions" /></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={editingId === user.id ? "row-active" : ""}>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td>{user.isSuperAdmin ? "Taip" : "—"}</td>
                  <td>
                    {!user.isSuperAdmin ? (
                      <button type="button" className="secondary-button" onClick={() => startEdit(user)}>Redaguoti</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
