"use client";

import { FormEvent, useEffect, useState } from "react";
import { copyText } from "@/lib/copy-text";
import { EDIT_PERMISSION_KEYS, PERMISSION_KEYS, resolvePermissions, VIEW_PERMISSION_KEYS, type PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isSuperAdmin: boolean;
  permissions: Record<PermissionKey, boolean>;
  loginPassword?: string;
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

function loginInviteText(user: AdminUser) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const loginUrl = `${origin}/login?email=${encodeURIComponent(user.email)}`;
  const lines = [
    `Prisijungimas: ${loginUrl}`,
    `El. paštas: ${user.email}`,
  ];
  if (user.loginPassword) lines.push(`Slaptažodis: ${user.loginPassword}`);
  return lines.join("\n");
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
    <>
      <div className="admin-table-wrap admin-permissions-desktop">
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
      </div>
      <div className="admin-permissions-mobile">
        {VIEW_PERMISSION_KEYS.map((key) => (
          <label key={key} className="admin-permission-mobile-item">
            <span>{PERMISSION_LABELS[key]}</span>
            <span className="admin-permission-mobile-control">
              <small>Matyti</small>
              <input
                type="checkbox"
                checked={permissions[key] ?? false}
                onChange={(event) => toggle(key, event.target.checked)}
                aria-label={`Matyti: ${PERMISSION_LABELS[key]}`}
              />
            </span>
          </label>
        ))}
        {EDIT_PERMISSION_KEYS.map((key) => (
          <label key={key} className="admin-permission-mobile-item">
            <span>{PERMISSION_LABELS[key]}</span>
            <span className="admin-permission-mobile-control">
              <small>Keisti</small>
              <input
                type="checkbox"
                checked={permissions[key] ?? false}
                onChange={(event) => toggle(key, event.target.checked)}
                aria-label={`Keisti: ${PERMISSION_LABELS[key]}`}
              />
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function UserActions({
  user,
  viewerIsSuperAdmin,
  viewerId,
  saving,
  copiedId,
  onCopyLogin,
  onCopyPassword,
  onResetPassword,
  onEdit,
  onDelete,
}: {
  user: AdminUser;
  viewerIsSuperAdmin: boolean;
  viewerId: string;
  saving: boolean;
  copiedId: string | null;
  onCopyLogin: (user: AdminUser) => void;
  onCopyPassword: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onEdit: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}) {
  const canDelete = !user.isSuperAdmin && user.id !== viewerId;
  return (
    <div className="admin-actions-cell">
      <button type="button" className="secondary-button" onClick={() => onCopyLogin(user)}>
        {copiedId === user.id ? "Nukopijuota" : "Kopijuoti viską"}
      </button>
      {viewerIsSuperAdmin && !user.isSuperAdmin ? (
        <button type="button" className="secondary-button" onClick={() => onResetPassword(user)} disabled={saving}>
          Naujas slaptažodis
        </button>
      ) : null}
      {!user.isSuperAdmin ? (
        <button type="button" className="secondary-button" onClick={() => onEdit(user)}>Redaguoti</button>
      ) : null}
      {canDelete ? (
        <button type="button" className="danger-button" onClick={() => onDelete(user)}>Pašalinti</button>
      ) : null}
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [viewerIsSuperAdmin, setViewerIsSuperAdmin] = useState(false);
  const [viewerId, setViewerId] = useState("");
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      const payload = await response.json() as {
        users?: AdminUser[];
        viewer?: { id?: string; isSuperAdmin?: boolean };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Nepavyko užkrauti");
      setUsers(payload.users ?? []);
      setViewerIsSuperAdmin(Boolean(payload.viewer?.isSuperAdmin));
      setViewerId(payload.viewer?.id ?? "");
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
    setEditPassword(user.loginPassword || "");
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

  async function copyLogin(user: AdminUser) {
    const ok = await copyText(loginInviteText(user));
    if (!ok) {
      setMessage("Nepavyko nukopijuoti. Nukopijuokite ranka.");
      return;
    }
    setCopiedId(user.id);
    setMessage(user.loginPassword
      ? "Nukopijuota prisijungimo nuoroda, el. paštas ir slaptažodis."
      : "Nukopijuota prisijungimo nuoroda ir el. paštas. Slaptažodžio dar nėra — naudokite „Naujas slaptažodis“.");
    window.setTimeout(() => setCopiedId((current) => current === user.id ? null : current), 2000);
  }

  async function copyPassword(user: AdminUser) {
    if (!user.loginPassword) {
      setMessage("Slaptažodžio nėra — sugeneruokite naują.");
      return;
    }
    const ok = await copyText(user.loginPassword);
    setMessage(ok ? "Slaptažodis nukopijuotas." : "Nepavyko nukopijuoti slaptažodžio.");
  }

  async function resetPassword(user: AdminUser) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.id, generatePassword: true }),
      });
      const payload = await response.json() as { error?: string; password?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko sugeneruoti slaptažodžio");
      const nextPassword = payload.password ?? "";
      const nextUser = { ...user, loginPassword: nextPassword };
      setUsers((current) => current.map((row) => (row.id === user.id ? nextUser : row)));
      if (editingId === user.id) setEditPassword(nextPassword);
      const copied = nextPassword ? await copyText(loginInviteText(nextUser)) : false;
      setMessage(copied
        ? "Naujas slaptažodis sugeneruotas ir nukopijuotas — išsiųskite vartotojui."
        : "Naujas slaptažodis sugeneruotas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Klaida");
    } finally {
      setSaving(false);
    }
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
      const payload = await response.json() as {
        error?: string;
        user?: AdminUser;
        credentials?: { email?: string; password?: string };
      };
      if (!response.ok) throw new Error(payload.error || "Nepavyko sukurti");

      const createdUser: AdminUser = payload.user ?? {
        id: "",
        email: payload.credentials?.email ?? email,
        displayName: displayName || email.split("@")[0],
        role,
        isSuperAdmin: false,
        permissions: resolvePermissions(role, permissions),
        loginPassword: payload.credentials?.password ?? password,
      };
      const copied = await copyText(loginInviteText(createdUser));

      setEmail("");
      setPassword("");
      setDisplayName("");
      setPermissions(emptyPermissions());
      setMessage(copied
        ? "Vartotojas sukurtas. Prisijungimo nuoroda ir slaptažodis nukopijuoti — išsiųskite vartotojui."
        : "Vartotojas sukurtas. Nepavyko automatiškai nukopijuoti — naudokite „Kopijuoti nuorodą“ sąraše.");
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

  async function confirmDelete() {
    if (!pendingDelete) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko pašalinti");
      setMessage("Vartotojas pašalintas");
      if (editingId === pendingDelete.id) cancelEdit();
      if (selectedUserId === pendingDelete.id) setSelectedUserId("");
      setPendingDelete(null);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Klaida");
    } finally {
      setSaving(false);
    }
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  return (
    <div className="admin-users-page">
      <header className="admin-users-head">
        <div>
          <a href="/">← Grįžti</a>
          <h1>Vartotojų valdymas</h1>
          <p>Kurkite individualius prisijungimus, redaguokite teises ir siųskite kvietimus. Super admin mato išsaugotus slaptažodžius ir gali juos atstatyti.</p>
        </div>
      </header>

      <section className="admin-users-create">
        <h2>Naujas vartotojas</h2>
        <form onSubmit={createUser} className="admin-user-form">
          <div className="form-grid">
            <label><span>El. paštas *</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label><span>Laikinas slaptažodis *</span><input type="text" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
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
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Kuriama…" : "Sukurti vartotoją"}</button>
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
              <label><span>Slaptažodis</span><input type="text" minLength={6} value={editPassword} onChange={(event) => setEditPassword(event.target.value)} placeholder="Bent 6 simboliai, jei keičiate" autoComplete="new-password" /></label>
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
          <>
            <div className="admin-users-mobile">
              <label className="admin-user-picker">
                <span>Pasirinkite vartotoją</span>
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  <option value="">— Rinkitės iš sąrašo —</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName || user.email} · {ROLE_LABELS[user.role] ?? user.role}
                    </option>
                  ))}
                </select>
              </label>
              {selectedUser ? (
                <article className={`admin-user-mobile-card${editingId === selectedUser.id ? " is-active" : ""}`}>
                  <div className="admin-user-mobile-meta">
                    <div><small>Vardas</small><strong>{selectedUser.displayName || "—"}</strong></div>
                    <div><small>El. paštas</small><strong>{selectedUser.email}</strong></div>
                    <div><small>Rolė</small><strong>{ROLE_LABELS[selectedUser.role] ?? selectedUser.role}</strong></div>
                    <div><small>Super admin</small><strong>{selectedUser.isSuperAdmin ? "Taip" : "Ne"}</strong></div>
                    {viewerIsSuperAdmin ? (
                      <div className="admin-user-mobile-password">
                        <small>Slaptažodis</small>
                        <strong className="admin-password-value">{selectedUser.loginPassword || "—"}</strong>
                        {selectedUser.loginPassword ? (
                          <button type="button" className="text-button" onClick={() => void copyPassword(selectedUser)}>Kopijuoti slaptažodį</button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <UserActions
                    user={selectedUser}
                    viewerIsSuperAdmin={viewerIsSuperAdmin}
                    viewerId={viewerId}
                    saving={saving}
                    copiedId={copiedId}
                    onCopyLogin={(user) => void copyLogin(user)}
                    onCopyPassword={(user) => void copyPassword(user)}
                    onResetPassword={(user) => void resetPassword(user)}
                    onEdit={startEdit}
                    onDelete={setPendingDelete}
                  />
                </article>
              ) : (
                <p className="admin-user-mobile-empty">Pasirinkite vartotoją, kad matytumėte informaciją ir veiksmus.</p>
              )}
            </div>

            <div className="admin-table-wrap admin-users-desktop">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th className="col-delete" />
                    <th className="col-name">Vardas</th>
                    <th className="col-email">El. paštas</th>
                    <th className="col-role">Rolė</th>
                    <th>Super admin</th>
                    {viewerIsSuperAdmin ? <th className="col-password">Slaptažodis</th> : null}
                    <th className="col-actions">Prisijungimas</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const canDelete = !user.isSuperAdmin && user.id !== viewerId;
                    return (
                      <tr key={user.id} className={editingId === user.id ? "row-active" : ""}>
                        <td className="col-delete">
                          {canDelete ? (
                            <button
                              type="button"
                              className="admin-delete-check"
                              onClick={() => setPendingDelete(user)}
                              aria-label={`Pašalinti ${user.displayName || user.email}`}
                              title="Pašalinti"
                            />
                          ) : null}
                        </td>
                        <td>{user.displayName}</td>
                        <td>{user.email}</td>
                        <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                        <td>{user.isSuperAdmin ? "Taip" : "—"}</td>
                        {viewerIsSuperAdmin ? (
                          <td className="col-password">
                            <span className="admin-password-value">{user.loginPassword || "—"}</span>
                            {user.loginPassword ? (
                              <button type="button" className="text-button" onClick={() => void copyPassword(user)}>Kopijuoti</button>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="col-actions">
                          <UserActions
                            user={user}
                            viewerIsSuperAdmin={viewerIsSuperAdmin}
                            viewerId={viewerId}
                            saving={saving}
                            copiedId={copiedId}
                            onCopyLogin={(row) => void copyLogin(row)}
                            onCopyPassword={(row) => void copyPassword(row)}
                            onResetPassword={(row) => void resetPassword(row)}
                            onEdit={startEdit}
                            onDelete={setPendingDelete}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {pendingDelete ? (
        <div className="report-modal-layer">
          <button type="button" className="modal-scrim" aria-label="Uždaryti" onClick={() => setPendingDelete(null)} />
          <div className="project-modal admin-delete-modal">
            <h2>Pašalinti vartotoją</h2>
            <p>Ar tikrai norite pašalinti?</p>
            <p className="admin-delete-target">{pendingDelete.displayName || pendingDelete.email}<br />{pendingDelete.email}</p>
            <div className="panel-actions">
              <button type="button" className="secondary-button" onClick={() => setPendingDelete(null)} disabled={saving}>Atšaukti</button>
              <button type="button" className="danger-button" onClick={() => void confirmDelete()} disabled={saving}>
                {saving ? "Šalinama…" : "Pašalinti"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
